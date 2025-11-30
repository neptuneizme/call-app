"use client";

import { useEffect, useRef } from "react";
import { VideoOff } from "lucide-react";

interface VideoGridProps {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isVideoOff: boolean;
  isCallActive: boolean;
  isCalling: boolean;
  remoteName?: string;
}

export function VideoGrid({
  localStream,
  remoteStream,
  isVideoOff,
  isCallActive,
  isCalling,
  remoteName = "Remote User",
}: VideoGridProps) {
  const myVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  // Attach local stream to video element
  useEffect(() => {
    if (myVideoRef.current && localStream) {
      myVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Attach remote stream to video element
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
      {/* My Video */}
      <div className="relative bg-gray-800 rounded-xl overflow-hidden aspect-video">
        <video
          ref={myVideoRef}
          autoPlay
          muted
          playsInline
          className={`w-full h-full object-cover ${isVideoOff ? "hidden" : ""}`}
        />
        {isVideoOff && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-700">
            <VideoOff className="w-16 h-16 text-gray-400" />
          </div>
        )}
        <div className="absolute bottom-4 left-4 bg-black/50 px-3 py-1 rounded-full">
          <span className="text-white text-sm">You</span>
        </div>
      </div>

      {/* Remote Video */}
      <div className="relative bg-gray-800 rounded-xl overflow-hidden aspect-video">
        {isCallActive ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-gray-400">
              {isCalling ? "Calling..." : "Waiting for connection..."}
            </span>
          </div>
        )}
        {isCallActive && (
          <div className="absolute bottom-4 left-4 bg-black/50 px-3 py-1 rounded-full">
            <span className="text-white text-sm">{remoteName}</span>
          </div>
        )}
      </div>
    </div>
  );
}
