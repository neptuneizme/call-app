"use client";

import { useCallback, useRef, useState } from "react";
import { postFetcher } from "@/lib/fetcher";

interface PresignResponse {
  presignedUrl: string;
  s3Key: string;
}

interface ConfirmUploadResponse {
  success: boolean;
  audioUploadId: string;
}

interface UseRecordingReturn {
  isRecording: boolean;
  isUploading: boolean;
  uploadError: string | null;
  recordingDuration: number;
  startRecording: (stream: MediaStream) => void;
  stopRecording: () => Promise<Blob | null>;
  uploadRecording: (callId: string) => Promise<boolean>;
}

export function useRecording(): UseRecordingReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingStartTimeRef = useRef<number | null>(null);
  const recordingBlobRef = useRef<Blob | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Start recording audio from the stream
  const startRecording = useCallback((stream: MediaStream) => {
    try {
      // Get only audio tracks for recording
      const audioStream = new MediaStream(stream.getAudioTracks());

      // Check if MediaRecorder is supported
      if (!MediaRecorder.isTypeSupported("audio/webm")) {
        console.error("audio/webm is not supported");
        return;
      }

      const mediaRecorder = new MediaRecorder(audioStream, {
        mimeType: "audio/webm",
      });

      audioChunksRef.current = [];
      recordingStartTimeRef.current = Date.now();

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        recordingBlobRef.current = audioBlob;
        console.log("Recording stopped, blob size:", audioBlob.size);
      };

      mediaRecorder.onerror = (event) => {
        console.error("MediaRecorder error:", event);
        setIsRecording(false);
      };

      // Start recording - collect data every second
      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      setRecordingDuration(0);

      // Update duration every second
      durationIntervalRef.current = setInterval(() => {
        if (recordingStartTimeRef.current) {
          const elapsed = Math.floor(
            (Date.now() - recordingStartTimeRef.current) / 1000
          );
          setRecordingDuration(elapsed);
        }
      }, 1000);

      console.log("Recording started");
    } catch (error) {
      console.error("Failed to start recording:", error);
    }
  }, []);

  // Stop recording and return the blob
  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }

      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.onstop = () => {
          const audioBlob = new Blob(audioChunksRef.current, {
            type: "audio/webm",
          });
          recordingBlobRef.current = audioBlob;
          setIsRecording(false);
          console.log("Recording stopped, blob size:", audioBlob.size);
          resolve(audioBlob);
        };

        mediaRecorderRef.current.stop();
      } else {
        setIsRecording(false);
        resolve(recordingBlobRef.current);
      }
    });
  }, []);

  // Upload the recording to S3
  const uploadRecording = useCallback(
    async (callId: string): Promise<boolean> => {
      const audioBlob = recordingBlobRef.current;

      console.log("uploadRecording called with callId:", callId);
      console.log("audioBlob:", audioBlob?.size, "bytes");

      if (!audioBlob || audioBlob.size === 0) {
        console.log("No recording to upload - blob is empty or null");
        return false;
      }

      setIsUploading(true);
      setUploadError(null);

      try {
        // Calculate duration
        const durationSeconds = recordingStartTimeRef.current
          ? (Date.now() - recordingStartTimeRef.current) / 1000
          : 0;

        console.log("Step 1: Getting presigned URL...");
        // Step 1: Get presigned URL using SWR fetcher
        const presignData = await postFetcher<PresignResponse>(
          `/api/calls/${callId}/presign`,
          {
            arg: {
              contentType: "audio/webm",
              fileExtension: "webm",
            },
          }
        );

        const { presignedUrl, s3Key } = presignData;
        console.log("Step 2: Uploading to S3...", s3Key);

        // Step 2: Upload directly to S3 (external URL, use native fetch)
        const uploadResponse = await fetch(presignedUrl, {
          method: "PUT",
          headers: {
            "Content-Type": "audio/webm",
          },
          body: audioBlob,
        });

        if (!uploadResponse.ok) {
          console.error("S3 upload failed:", uploadResponse.status);
          throw new Error("Failed to upload to S3");
        }

        console.log("Step 3: Confirming upload in database...");

        // Step 3: Confirm upload in database using SWR fetcher
        const confirmData = await postFetcher<ConfirmUploadResponse>(
          `/api/calls/${callId}/confirm-upload`,
          {
            arg: {
              s3Key,
              fileSize: audioBlob.size,
              durationSeconds,
              mimeType: "audio/webm",
            },
          }
        );

        console.log("Upload confirmed successfully:", confirmData);

        // Clear the recording blob after successful upload
        recordingBlobRef.current = null;
        audioChunksRef.current = [];

        setIsUploading(false);
        return true;
      } catch (error) {
        console.error("Upload failed:", error);
        setUploadError(
          error instanceof Error ? error.message : "Upload failed"
        );
        setIsUploading(false);
        return false;
      }
    },
    []
  );

  return {
    isRecording,
    isUploading,
    uploadError,
    recordingDuration,
    startRecording,
    stopRecording,
    uploadRecording,
  };
}
