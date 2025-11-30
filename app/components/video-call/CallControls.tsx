"use client";

import { Mic, MicOff, Video, VideoOff, Phone, PhoneOff } from "lucide-react";

interface CallControlsProps {
  isMuted: boolean;
  isVideoOff: boolean;
  isCallActive: boolean;
  isCalling: boolean;
  canStartCall: boolean;
  onToggleMic: () => void;
  onToggleVideo: () => void;
  onStartCall: () => void;
  onEndCall: () => void;
}

export function CallControls({
  isMuted,
  isVideoOff,
  isCallActive,
  isCalling,
  canStartCall,
  onToggleMic,
  onToggleVideo,
  onStartCall,
  onEndCall,
}: CallControlsProps) {
  return (
    <div className="flex justify-center gap-4 mb-8">
      {/* Mic Toggle */}
      <button
        onClick={onToggleMic}
        className={`p-4 rounded-full transition-colors ${
          isMuted
            ? "bg-red-500 hover:bg-red-600"
            : "bg-gray-600 hover:bg-gray-700"
        }`}
        title={isMuted ? "Unmute" : "Mute"}
      >
        {isMuted ? (
          <MicOff className="w-6 h-6 text-white" />
        ) : (
          <Mic className="w-6 h-6 text-white" />
        )}
      </button>

      {/* Video Toggle */}
      <button
        onClick={onToggleVideo}
        className={`p-4 rounded-full transition-colors ${
          isVideoOff
            ? "bg-red-500 hover:bg-red-600"
            : "bg-gray-600 hover:bg-gray-700"
        }`}
        title={isVideoOff ? "Turn on camera" : "Turn off camera"}
      >
        {isVideoOff ? (
          <VideoOff className="w-6 h-6 text-white" />
        ) : (
          <Video className="w-6 h-6 text-white" />
        )}
      </button>

      {/* Call/End Call Button */}
      {isCallActive ? (
        <button
          onClick={onEndCall}
          className="p-4 rounded-full bg-red-500 hover:bg-red-600 transition-colors"
          title="End call"
        >
          <PhoneOff className="w-6 h-6 text-white" />
        </button>
      ) : (
        <button
          onClick={onStartCall}
          disabled={!canStartCall || isCalling}
          className="p-4 rounded-full bg-green-500 hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Start call"
        >
          <Phone className="w-6 h-6 text-white" />
        </button>
      )}
    </div>
  );
}
