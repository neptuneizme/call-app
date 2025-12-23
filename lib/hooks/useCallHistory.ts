"use client";

import useSWR from "swr";
import { useState, useCallback } from "react";
import { fetcher, deleteFetcher } from "@/lib/fetcher";

interface Participant {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string;
  joinedAt: string;
  leftAt: string | null;
}

interface AudioUpload {
  id: string;
  userId: string;
  status: string;
  uploadedAt: string;
  fileSize: number;
  durationSeconds: number | null;
}

interface Summary {
  id: string;
  preview: string;
  fullSummary: string | null;
  transcript: string | null;
  generatedAt: string;
}

export interface Call {
  id: string;
  callId: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  duration: number | null;
  participants: Participant[];
  audioUploads: AudioUpload[];
  summary: Summary | null;
}

interface HistoryResponse {
  calls: Call[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

interface UseCallHistoryOptions {
  limit?: number;
  enabled?: boolean;
  pollingInterval?: number;
}

interface UseCallHistoryReturn {
  calls: Call[];
  isLoading: boolean;
  error: Error | undefined;
  hasMore: boolean;
  isLoadingMore: boolean;
  deletingCallId: string | null;
  needsPolling: boolean;
  loadMore: () => Promise<void>;
  deleteCall: (callId: string) => Promise<void>;
  refresh: () => void;
  downloadAudio: (callId: string) => Promise<void>;
}

export function useCallHistory(
  options: UseCallHistoryOptions = {}
): UseCallHistoryReturn {
  const { limit = 20, enabled = true, pollingInterval = 5000 } = options;

  const [additionalCalls, setAdditionalCalls] = useState<Call[]>([]);
  const [offset, setOffset] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [deletingCallId, setDeletingCallId] = useState<string | null>(null);

  // Main data fetch
  const { data, error, isLoading, mutate } = useSWR<HistoryResponse>(
    enabled ? `/api/history?limit=${limit}&offset=0` : null,
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
    }
  );

  // Combine initial data with additional loaded calls
  const calls = data ? [...data.calls, ...additionalCalls] : [];
  const hasMore = data?.hasMore ?? false;

  // Check if any calls need polling (processing status)
  const needsPolling = calls.some(
    (call) =>
      call.status === "IN_PROGRESS" ||
      call.status === "AWAITING_UPLOADS" ||
      call.status === "PROCESSING"
  );

  // Polling for active calls
  useSWR<HistoryResponse>(
    enabled && needsPolling ? `/api/history?limit=${limit}&offset=0` : null,
    {
      refreshInterval: pollingInterval,
      onSuccess: (newData) => {
        mutate(newData, false);
      },
    }
  );

  // Load more calls
  const loadMore = useCallback(async () => {
    setIsLoadingMore(true);
    try {
      const newOffset = offset + limit;
      const moreData = await fetcher<HistoryResponse>(
        `/api/history?limit=${limit}&offset=${newOffset}`
      );
      setAdditionalCalls((prev) => [...prev, ...moreData.calls]);
      setOffset(newOffset);
    } catch (err) {
      console.error("Failed to load more calls:", err);
      throw err;
    } finally {
      setIsLoadingMore(false);
    }
  }, [offset, limit]);

  // Delete a call
  const deleteCall = useCallback(
    async (callId: string) => {
      setDeletingCallId(callId);
      try {
        await deleteFetcher(`/api/calls/${callId}`);
        setAdditionalCalls((prev) => prev.filter((c) => c.callId !== callId));
        mutate();
      } catch (err) {
        console.error("Failed to delete call:", err);
        throw err;
      } finally {
        setDeletingCallId(null);
      }
    },
    [mutate]
  );

  // Refresh the list
  const refresh = useCallback(() => {
    setAdditionalCalls([]);
    setOffset(0);
    mutate();
  }, [mutate]);

  // Download audio files
  const downloadAudio = useCallback(async (callId: string) => {
    const data = await fetcher<{
      callId: string;
      mergedAudioUrl: string;
      mergedAudioPath: string;
    }>(`/api/calls/${callId}/audio`);

    // Download the merged audio file
    const link = document.createElement("a");
    link.href = data.mergedAudioUrl;
    link.download = `call-${callId}.wav`;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  return {
    calls,
    isLoading,
    error,
    hasMore,
    isLoadingMore,
    deletingCallId,
    needsPolling,
    loadMore,
    deleteCall,
    refresh,
    downloadAudio,
  };
}
