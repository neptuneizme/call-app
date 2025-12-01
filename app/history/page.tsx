"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Phone, RefreshCw, History, Loader2, AlertCircle } from "lucide-react";
import CallHistoryCard from "@/app/components/CallHistoryCard";
import { useCallHistory } from "@/lib/hooks/useCallHistory";

export default function HistoryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Use custom SWR hook for call history
  const {
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
  } = useCallHistory({
    enabled: status === "authenticated",
    limit: 20,
    pollingInterval: 5000,
  });

  // Redirect unauthenticated users
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  // Handle delete with error alert
  const handleDelete = async (callId: string) => {
    try {
      await deleteCall(callId);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete call");
    }
  };

  // Handle download with error alert
  const handleDownloadAudio = async (callId: string) => {
    try {
      await downloadAudio(callId);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to download audio");
    }
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
            {needsPolling && (
              <span className="flex items-center gap-1 text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded-full">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                Live
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
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
            <span className="text-red-400">{error.message}</span>
            <button
              onClick={refresh}
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
              onClick={loadMore}
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
