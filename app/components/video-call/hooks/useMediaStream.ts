"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface UseMediaStreamReturn {
  stream: MediaStream | null;
  isLoading: boolean;
  error: string | null;
  isMuted: boolean;
  isVideoOff: boolean;
  toggleMic: () => void;
  toggleVideo: () => void;
  stopAllTracks: () => void;
}

export function useMediaStream(): UseMediaStreamReturn {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);

  // Initialize camera/mic on mount
  useEffect(() => {
    const initializeMedia = async () => {
      try {
        setIsLoading(true);
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        streamRef.current = mediaStream;
        setStream(mediaStream);
        setError(null);
      } catch (err) {
        console.error("Error accessing media devices:", err);
        setError(
          "Please allow camera and microphone access to use video calling."
        );
      } finally {
        setIsLoading(false);
      }
    };

    initializeMedia();

    // Cleanup on unmount
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Toggle microphone
  const toggleMic = useCallback(() => {
    if (streamRef.current) {
      const audioTracks = streamRef.current.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsMuted((prev) => !prev);
    }
  }, []);

  // Toggle video
  const toggleVideo = useCallback(() => {
    if (streamRef.current) {
      const videoTracks = streamRef.current.getVideoTracks();
      videoTracks.forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsVideoOff((prev) => !prev);
    }
  }, []);

  // Stop all tracks
  const stopAllTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
  }, []);

  return {
    stream,
    isLoading,
    error,
    isMuted,
    isVideoOff,
    toggleMic,
    toggleVideo,
    stopAllTracks,
  };
}
