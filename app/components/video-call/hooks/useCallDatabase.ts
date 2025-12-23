"use client";

import { useCallback, useRef, useState } from "react";
import useSWRMutation from "swr/mutation";
import { postFetcher, patchFetcher } from "@/lib/fetcher";

interface CreateCallResponse {
  callId: string;
}

interface JoinCallResponse {
  callId: string;
}

interface UseCallDatabaseReturn {
  createCallRecord: (callId: string) => Promise<{ callId: string } | null>;
  joinCallRecord: (callId: string) => Promise<{ callId: string } | null>;
  endCallRecord: (callIdOverride?: string) => Promise<void>;
  isCreating: boolean;
  isJoining: boolean;
  isEnding: boolean;
}

export function useCallDatabase(): UseCallDatabaseReturn {
  const currentCallIdRef = useRef<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [isEnding, setIsEnding] = useState(false);

  // SWR mutation for creating a call
  const { trigger: triggerCreate, isMutating: isCreating } = useSWRMutation(
    "/api/calls",
    postFetcher<CreateCallResponse>
  );

  const setCurrentCallId = useCallback((callId: string | null) => {
    console.log("setCurrentCallId:", callId);
    currentCallIdRef.current = callId;
  }, []);

  const getCurrentCallId = useCallback(() => {
    return currentCallIdRef.current;
  }, []);

  // Join an existing call record
  const joinCallRecord = useCallback(
    async (callId: string): Promise<{ callId: string } | null> => {
      setIsJoining(true);
      try {
        console.log("Joining call record:", callId);
        const response = await postFetcher<JoinCallResponse>(
          `/api/calls/${callId}/join`,
          { arg: {} }
        );

        if (response) {
          currentCallIdRef.current = callId;
          console.log("Joined call record, storing callId:", callId);
          return { callId };
        }
      } catch (error) {
        console.error("Failed to join call record:", error);
      } finally {
        setIsJoining(false);
      }
      return null;
    },
    []
  );

  // Create a call record in database
  const createCallRecord = useCallback(
    async (callId: string): Promise<{ callId: string } | null> => {
      try {
        console.log("Creating call record:", callId);
        await triggerCreate({ callId });
        currentCallIdRef.current = callId;
        console.log("Call record created, storing callId:", callId);
        return { callId };
      } catch (error) {
        // Check if call already exists (409 conflict)
        if (error instanceof Error && error.message.includes("409")) {
          console.log("Call exists, joining...");
          return await joinCallRecord(callId);
        }
        console.error("Failed to create call record:", error);
        return null;
      }
    },
    [triggerCreate, joinCallRecord]
  );

  // End call in database
  const endCallRecord = useCallback(
    async (callIdOverride?: string): Promise<void> => {
      const callIdToUse = callIdOverride || currentCallIdRef.current;
      console.log("endCallRecord called, callId:", callIdToUse);

      if (callIdToUse) {
        setIsEnding(true);
        try {
          await patchFetcher(`/api/calls/${callIdToUse}`, {
            arg: { endCall: true },
          });
          console.log("Call ended in database:", callIdToUse);
        } catch (error) {
          console.error("Failed to end call in database:", error);
        } finally {
          setIsEnding(false);
        }

        if (!callIdOverride) {
          currentCallIdRef.current = null;
        }
      } else {
        console.log("endCallRecord: No callId available");
      }
    },
    []
  );

  return {
    createCallRecord,
    joinCallRecord,
    endCallRecord,
    isCreating,
    isJoining,
    isEnding,
  };
}
