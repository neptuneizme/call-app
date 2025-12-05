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
  stopAndUpload: (callId: string) => Promise<boolean>;
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
  const isRecordingRef = useRef(false); // Ref to track recording state for callbacks
  const isUploadingRef = useRef(false); // Ref to prevent duplicate uploads
  const hasUploadedRef = useRef(false); // Ref to track if upload already completed

  // Start recording audio from the stream
  const startRecording = useCallback((stream: MediaStream) => {
    try {
      // Reset upload flags for new recording session
      hasUploadedRef.current = false;
      isUploadingRef.current = false;

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
        isRecordingRef.current = false;
      };

      // Start recording - collect data every second
      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      isRecordingRef.current = true;
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
          isRecordingRef.current = false;
          console.log("Recording stopped, blob size:", audioBlob.size);
          resolve(audioBlob);
        };

        mediaRecorderRef.current.stop();
      } else {
        setIsRecording(false);
        isRecordingRef.current = false;
        resolve(recordingBlobRef.current);
      }
    });
  }, []);

  // Upload the recording to S3
  const uploadRecording = useCallback(
    async (callId: string): Promise<boolean> => {
      // Guard: Prevent duplicate uploads
      if (isUploadingRef.current) {
        console.log("Upload already in progress, skipping...");
        return false;
      }

      if (hasUploadedRef.current) {
        console.log("Already uploaded for this session, skipping...");
        return false;
      }

      const audioBlob = recordingBlobRef.current;

      console.log("uploadRecording called with callId:", callId);
      console.log("audioBlob:", audioBlob?.size, "bytes");

      if (!audioBlob || audioBlob.size === 0) {
        console.log("No recording to upload - blob is empty or null");
        return false;
      }

      // Set uploading guards
      isUploadingRef.current = true;
      setIsUploading(true);
      setUploadError(null);

      try {
        // Calculate duration
        const durationSeconds = recordingStartTimeRef.current
          ? (Date.now() - recordingStartTimeRef.current) / 1000
          : 0;

        console.log("Step 1: Getting presigned URL...");
        console.log("  - callId:", callId);
        console.log("  - blob size:", audioBlob.size, "bytes");

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
        console.log("Step 2: Uploading to S3...");
        console.log("  - s3Key:", s3Key);
        console.log("  - presignedUrl length:", presignedUrl?.length);

        // Step 2: Upload directly to S3 (external URL, use native fetch)
        const uploadResponse = await fetch(presignedUrl, {
          method: "PUT",
          headers: {
            "Content-Type": "audio/webm",
          },
          body: audioBlob,
        });

        console.log("  - S3 upload response status:", uploadResponse.status);

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text().catch(() => "");
          console.error("S3 upload failed:", uploadResponse.status, errorText);
          throw new Error(`Failed to upload to S3: ${uploadResponse.status}`);
        }

        console.log("Step 3: Confirming upload in database...");
        console.log("  - s3Key:", s3Key);
        console.log("  - fileSize:", audioBlob.size);
        console.log("  - durationSeconds:", durationSeconds);

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

        // Mark as uploaded to prevent future attempts
        hasUploadedRef.current = true;
        isUploadingRef.current = false;
        setIsUploading(false);
        return true;
      } catch (error) {
        console.error("Upload failed:", error);
        setUploadError(
          error instanceof Error ? error.message : "Upload failed"
        );
        isUploadingRef.current = false;
        setIsUploading(false);
        return false;
      }
    },
    []
  );

  // Combined stop and upload - uses ref to check recording state (avoids stale closure)
  const stopAndUpload = useCallback(
    async (callId: string): Promise<boolean> => {
      console.log(
        "stopAndUpload called, callId:",
        callId,
        "isRecordingRef:",
        isRecordingRef.current
      );

      // Use ref to check if recording (avoids stale state in callbacks)
      if (!isRecordingRef.current && !recordingBlobRef.current) {
        console.log("No recording to stop/upload");
        return false;
      }

      // Stop recording first
      if (isRecordingRef.current) {
        console.log("Stopping recording...");
        await stopRecording();
      }

      // Reset duration display
      setRecordingDuration(0);

      // Then upload
      if (callId && recordingBlobRef.current) {
        console.log("Uploading recording for call:", callId);
        return await uploadRecording(callId);
      }

      return false;
    },
    [stopRecording, uploadRecording]
  );

  return {
    isRecording,
    isUploading,
    uploadError,
    recordingDuration,
    startRecording,
    stopRecording,
    uploadRecording,
    stopAndUpload,
  };
}
