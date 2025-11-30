"use client";

import { Phone, PhoneOff, PhoneIncoming } from "lucide-react";

interface IncomingCallModalProps {
  callerName: string;
  onAnswer: () => void;
  onDecline: () => void;
}

export function IncomingCallModal({
  callerName,
  onAnswer,
  onDecline,
}: IncomingCallModalProps) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-xl p-8 max-w-md w-full mx-4 text-center">
        <div className="mb-6">
          <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
            <PhoneIncoming className="w-10 h-10 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Incoming Call</h2>
          <p className="text-gray-400">
            {callerName || "Someone"} is calling you
          </p>
        </div>
        <div className="flex justify-center gap-4">
          <button
            onClick={onDecline}
            className="px-8 py-3 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors flex items-center gap-2"
          >
            <PhoneOff className="w-5 h-5" />
            Decline
          </button>
          <button
            onClick={onAnswer}
            className="px-8 py-3 bg-green-500 hover:bg-green-600 text-white rounded-full transition-colors flex items-center gap-2"
          >
            <Phone className="w-5 h-5" />
            Answer
          </button>
        </div>
      </div>
    </div>
  );
}
