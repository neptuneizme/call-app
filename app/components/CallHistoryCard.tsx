"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Download,
  Trash2,
  Clock,
  Users,
  FileAudio,
  CheckCircle,
  XCircle,
  Loader2,
  FileText,
} from "lucide-react";
import StatusBadge from "./StatusBadge";
import ParticipantAvatars from "./ParticipantAvatars";
import TranscriptModal from "./TranscriptModal";

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
  transcript: string | null;
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

interface CallHistoryCardProps {
  call: Call;
  currentUserId: string;
  onDelete: (callId: string) => void;
  onDownloadAudio: (callId: string) => void;
  isDeleting?: boolean;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CallHistoryCard({
  call,
  currentUserId,
  onDelete,
  onDownloadAudio,
  isDeleting = false,
}: CallHistoryCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  const getParticipantUploadStatus = (oderId: string) => {
    return call.audioUploads.find((u) => u.oderId === oderId);
  };

  return (
    <div className="bg-gray-800 rounded-xl overflow-hidden transition-all duration-200 hover:bg-gray-750">
      {/* Main Row - Always Visible */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between text-left cursor-pointer"
      >
        <div className="flex items-center gap-4 flex-1 min-w-0">
          {/* Participants */}
          <ParticipantAvatars participants={call.participants} size="md" />

          {/* Call Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-white font-medium truncate">
                {call.participants
                  .filter((p) => p.id !== currentUserId)
                  .map((p) => p.name || p.email || "Unknown")
                  .join(", ") || "Solo Call"}
              </span>
              <StatusBadge status={call.status} size="sm" />
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-400">
              <span>{formatDate(call.startedAt)}</span>
              <span>•</span>
              <span>{formatTime(call.startedAt)}</span>
              {call.duration && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDuration(call.duration)}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Actions & Expand */}
        <div className="flex items-center gap-2 ml-4">
          {/* Quick Actions */}
          {call.audioUploads.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDownloadAudio(call.callId);
              }}
              className="p-2 text-gray-400 hover:text-blue-400 hover:bg-gray-700 rounded-lg transition-colors"
              title="Download Audio"
            >
              <Download className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm("Are you sure you want to delete this call?")) {
                onDelete(call.callId);
              }
            }}
            disabled={isDeleting}
            className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
            title="Delete Call"
          >
            {isDeleting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </button>

          {/* Expand Icon */}
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-gray-700">
          {/* Participants Section */}
          <div className="mt-4">
            <h4 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Participants
            </h4>
            <div className="space-y-2">
              {call.participants.map((participant) => {
                const upload = getParticipantUploadStatus(participant.id);
                return (
                  <div
                    key={participant.id}
                    className="flex items-center justify-between bg-gray-700/50 rounded-lg p-3"
                  >
                    <div className="flex items-center gap-3">
                      <ParticipantAvatars
                        participants={[participant]}
                        size="sm"
                      />
                      <div>
                        <span className="text-white text-sm">
                          {participant.name || participant.email || "Unknown"}
                          {participant.id === currentUserId && (
                            <span className="text-gray-400 ml-1">(You)</span>
                          )}
                        </span>
                        <span className="text-gray-400 text-xs ml-2 capitalize">
                          {participant.role}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {upload ? (
                        <span className="flex items-center gap-1 text-xs">
                          {upload.status === "COMPLETED" ? (
                            <CheckCircle className="w-4 h-4 text-green-400" />
                          ) : upload.status === "FAILED" ? (
                            <XCircle className="w-4 h-4 text-red-400" />
                          ) : (
                            <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />
                          )}
                          <span className="text-gray-400">
                            {formatFileSize(upload.fileSize)}
                          </span>
                        </span>
                      ) : (
                        <span className="text-xs text-gray-500">
                          No audio uploaded
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Audio Uploads Section */}
          {call.audioUploads.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
                <FileAudio className="w-4 h-4" />
                Audio Files
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {call.audioUploads.map((upload) => {
                  const participant = call.participants.find(
                    (p) => p.id === upload.oderId
                  );
                  return (
                    <div
                      key={upload.id}
                      className="bg-gray-700/50 rounded-lg p-3 flex items-center justify-between"
                    >
                      <div>
                        <span className="text-white text-sm">
                          {participant?.name || "Unknown"}
                        </span>
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          <span>{formatFileSize(upload.fileSize)}</span>
                          {upload.durationSeconds && (
                            <>
                              <span>•</span>
                              <span>
                                {formatDuration(
                                  Math.round(upload.durationSeconds)
                                )}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <StatusBadge status={upload.status} size="sm" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Summary Preview */}
          {call.summary && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-gray-300">Summary</h4>
                {call.summary.transcript ? (
                  <button
                    onClick={() => setShowTranscript(true)}
                    className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    <FileText className="w-3 h-3" />
                    Xem bản ghi
                  </button>
                ) : (
                  <span className="text-xs text-gray-500">
                    Không có bản ghi
                  </span>
                )}
              </div>
              <div className="bg-gray-700/50 rounded-lg p-3">
                <p className="text-gray-300 text-sm">{call.summary.preview}</p>
                <p className="text-xs text-gray-500 mt-2">
                  Generated {formatDate(call.summary.generatedAt)}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Transcript Modal */}
      {showTranscript && call.summary?.transcript && (
        <TranscriptModal
          transcript={call.summary.transcript}
          callId={call.callId}
          onClose={() => setShowTranscript(false)}
        />
      )}
    </div>
  );
}
