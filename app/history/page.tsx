"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Phone, RefreshCw, History, Loader2, AlertCircle } from "lucide-react";
import CallHistoryCard from "@/app/components/CallHistoryCard";

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
  oderId: string;
  status: string;
  uploadedAt: string;
  fileSize: number;
  durationSeconds: number | null;
}

interface Summary {
  id: string;
  preview: string;
  keyPoints: unknown;
  generatedAt: string;
}

interface Call {
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

// Polling interval in milliseconds
const POLLING_INTERVAL = 5000; // 5 seconds

export default function HistoryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [calls, setCalls] = useState<Call[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [deletingCallId, setDeletingCallId] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  const limit = 20;

  // Check if any calls need polling (processing status)
  const needsPolling = calls.some(
    (call) =>
      call.status === "IN_PROGRESS" ||
      call.status === "AWAITING_UPLOADS" ||
      call.status === "PROCESSING"
  );

  // Fetch history
  const fetchHistory = useCallback(
    async (newOffset: number = 0, append: boolean = false) => {
      try {
        if (!append) {
          setIsLoading(true);
        }
        setError(null);

        const response = await fetch(
          `/api/history?limit=${limit}&offset=${newOffset}`
        );

        if (!response.ok) {
          throw new Error("Failed to fetch history");
        }

        const data: HistoryResponse = await response.json();

        if (append) {
          setCalls((prev) => [...prev, ...data.calls]);
        } else {
          setCalls(data.calls);
        }

        setHasMore(data.hasMore);
        setOffset(newOffset);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [limit]
  );

  // Initial fetch
  useEffect(() => {
    if (status === "authenticated") {
      fetchHistory();
    } else if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router, fetchHistory]);

  // Polling for real-time updates
  useEffect(() => {
    if (!needsPolling || status !== "authenticated") {
      setIsPolling(false);
      return;
    }

    setIsPolling(true);

    const intervalId = setInterval(() => {
      // Silently refresh data
      fetch(`/api/history?limit=${limit}&offset=0`)
        .then((res) => res.json())
        .then((data: HistoryResponse) => {
          setCalls((prevCalls) => {
            // Merge updates: update existing calls, keep loaded calls
            const updatedCalls = [...prevCalls];
            data.calls.forEach((newCall) => {
              const index = updatedCalls.findIndex((c) => c.id === newCall.id);
              if (index >= 0) {
                updatedCalls[index] = newCall;
              }
            });
            return updatedCalls;
          });
        })
        .catch(console.error);
    }, POLLING_INTERVAL);

    return () => clearInterval(intervalId);
  }, [needsPolling, status, limit]);

  // Load more
  const handleLoadMore = () => {
    setIsLoadingMore(true);
    fetchHistory(offset + limit, true);
  };

  // Delete call
  const handleDelete = async (callId: string) => {
    try {
      setDeletingCallId(callId);

      const response = await fetch(`/api/calls/${callId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete call");
      }

      // Remove from local state
      setCalls((prev) => prev.filter((c) => c.callId !== callId));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete call");
    } finally {
      setDeletingCallId(null);
    }
  };

  // Download audio
  const handleDownloadAudio = async (callId: string) => {
    try {
      const response = await fetch(`/api/calls/${callId}/audio`);

      if (!response.ok) {
        throw new Error("Failed to get audio files");
      }

      const data = await response.json();

      // Open download URLs in new tabs
      data.audioFiles.forEach(
        (file: { downloadUrl: string; userName: string }) => {
          const link = document.createElement("a");
          link.href = file.downloadUrl;
          link.download = `${file.userName || "audio"}.webm`;
          link.target = "_blank";
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to download audio");
    }
  };

  // Manual refresh
  const handleRefresh = () => {
    fetchHistory(0, false);
  };

  // Loading state
  if (status === "loading" || (isLoading && calls.length === 0)) {
    return (
      <div className="min-h-screen bg-linear-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-900 via-gray-800 to-gray-900 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <History className="w-8 h-8 text-blue-500" />
            <h1 className="text-2xl font-bold text-white">Call History</h1>
            {isPolling && (
              <span className="flex items-center gap-1 text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded-full">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                Live
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw
                className={`w-5 h-5 ${isLoading ? "animate-spin" : ""}`}
              />
            </button>
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
            >
              <Phone className="w-4 h-4" />
              New Call
            </button>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <span className="text-red-400">{error}</span>
            <button
              onClick={handleRefresh}
              className="ml-auto text-sm text-red-400 hover:text-red-300 underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && calls.length === 0 && (
          <div className="bg-gray-800 rounded-xl p-12 text-center">
            <History className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">
              No calls yet
            </h2>
            <p className="text-gray-400 mb-6">
              Start your first video call to see it here
            </p>
            <button
              onClick={() => router.push("/")}
              className="inline-flex items-center gap-2 px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
            >
              <Phone className="w-5 h-5" />
              Start a Call
            </button>
          </div>
        )}

        {/* Call List */}
        {calls.length > 0 && (
          <div className="space-y-3">
            {calls.map((call) => (
              <CallHistoryCard
                key={call.id}
                call={call}
                currentUserId={session?.user?.id || ""}
                onDelete={handleDelete}
                onDownloadAudio={handleDownloadAudio}
                isDeleting={deletingCallId === call.callId}
              />
            ))}
          </div>
        )}

        {/* Load More */}
        {hasMore && (
          <div className="mt-6 text-center">
            <button
              onClick={handleLoadMore}
              disabled={isLoadingMore}
              className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-50 inline-flex items-center gap-2"
            >
              {isLoadingMore ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading...
                </>
              ) : (
                "Load More"
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
