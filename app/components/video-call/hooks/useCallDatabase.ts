"use client";

import { useCallback, useRef } from "react";

interface UseCallDatabaseReturn {
  currentCallId: string | null;
  createCallRecord: (callId: string) => Promise<{ callId: string } | null>;
  joinCallRecord: (callId: string) => Promise<{ callId: string } | null>;
  endCallRecord: (callIdOverride?: string) => Promise<void>;
  setCurrentCallId: (callId: string | null) => void;
  getCurrentCallId: () => string | null;
}

export function useCallDatabase(): UseCallDatabaseReturn {
  const currentCallIdRef = useRef<string | null>(null);

  const setCurrentCallId = useCallback((callId: string | null) => {
    console.log("setCurrentCallId:", callId);
    currentCallIdRef.current = callId;
  }, []);

  const getCurrentCallId = useCallback(() => {
    return currentCallIdRef.current;
  }, []);

  // Create a call record in database
  const createCallRecord = useCallback(
    async (callId: string): Promise<{ callId: string } | null> => {
      try {
        console.log("Creating call record:", callId);
        const response = await fetch("/api/calls", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callId }),
        });

        if (response.ok) {
          await response.json(); // Consume the response
          currentCallIdRef.current = callId; // Use the passed callId, not data.callId (which is internal DB id)
          console.log("Call record created, storing callId:", callId);
          return { callId };
        } else if (response.status === 409) {
          // Call already exists, try to join
          console.log("Call exists, joining...");
          return await joinCallRecord(callId);
        } else {
          const error = await response.json();
          console.error("Failed to create call:", error);
        }
      } catch (error) {
        console.error("Failed to create call record:", error);
      }
      return null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Join an existing call record
  const joinCallRecord = useCallback(
    async (callId: string): Promise<{ callId: string } | null> => {
      try {
        console.log("Joining call record:", callId);
        const response = await fetch(`/api/calls/${callId}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        if (response.ok) {
          currentCallIdRef.current = callId;
          console.log("Joined call record, storing callId:", callId);
          return { callId };
        } else {
          const error = await response.json();
          console.error("Failed to join call:", error);
        }
      } catch (error) {
        console.error("Failed to join call record:", error);
      }
      return null;
    },
    []
  );

  // End call in database
  const endCallRecord = useCallback(
    async (callIdOverride?: string): Promise<void> => {
      const callIdToUse = callIdOverride || currentCallIdRef.current;
      console.log("endCallRecord called, callId:", callIdToUse);

      if (callIdToUse) {
        try {
          const response = await fetch(`/api/calls/${callIdToUse}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endCall: true }),
          });

          if (response.ok) {
            console.log("Call ended in database:", callIdToUse);
          } else {
            const error = await response.json();
            console.error("Failed to end call:", error);
          }
        } catch (error) {
          console.error("Failed to end call in database:", error);
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
    currentCallId: currentCallIdRef.current,
    createCallRecord,
    joinCallRecord,
    endCallRecord,
    setCurrentCallId,
    getCurrentCallId,
  };
}
