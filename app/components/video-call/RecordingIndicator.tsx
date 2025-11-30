"use client";

interface RecordingIndicatorProps {
  isRecording: boolean;
  duration: number;
  isUploading?: boolean;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;
}

export function RecordingIndicator({
  isRecording,
  duration,
  isUploading = false,
}: RecordingIndicatorProps) {
  if (!isRecording && !isUploading) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 border border-red-500/30 rounded-full">
      {isUploading ? (
        <>
          <div className="w-2.5 h-2.5 bg-yellow-500 rounded-full animate-pulse" />
          <span className="text-yellow-400 text-sm font-medium">
            Uploading...
          </span>
        </>
      ) : (
        <>
          <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
          <span className="text-red-400 text-sm font-medium">REC</span>
          <span className="text-red-400 text-sm">
            {formatDuration(duration)}
          </span>
        </>
      )}
    </div>
  );
}
