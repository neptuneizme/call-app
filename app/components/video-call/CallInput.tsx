"use client";

import { Phone } from "lucide-react";

interface CallInputProps {
  mySocketId: string;
  idToCall: string;
  isCallActive: boolean;
  isCalling: boolean;
  onIdToCallChange: (id: string) => void;
  onCall: () => void;
}

export function CallInput({
  mySocketId,
  idToCall,
  isCallActive,
  isCalling,
  onIdToCallChange,
  onCall,
}: CallInputProps) {
  const copyIdToClipboard = () => {
    if (mySocketId) {
      navigator.clipboard.writeText(mySocketId);
      alert("ID copied to clipboard!");
    } else {
      alert("No ID available yet. Please wait for connection.");
    }
  };

  return (
    <>
      {/* My ID Section */}
      <div className="bg-gray-800 rounded-xl p-6 mb-4">
        <h2 className="text-lg font-semibold text-white mb-2">Your ID</h2>
        <p className="text-gray-400 text-sm mb-2">
          Share this ID with others so they can call you
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={mySocketId || "Connecting..."}
            readOnly
            className="flex-1 bg-gray-700 text-white px-4 py-2 rounded-lg text-sm cursor-text select-all"
          />
          <button
            onClick={copyIdToClipboard}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
          >
            Copy
          </button>
        </div>
      </div>

      {/* Call User Section */}
      <div className="bg-gray-800 rounded-xl p-6 mb-4">
        <h2 className="text-lg font-semibold text-white mb-2">Call a User</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={idToCall}
            onChange={(e) => onIdToCallChange(e.target.value)}
            placeholder="Enter user ID to call"
            className="flex-1 bg-gray-700 text-white px-4 py-2 rounded-lg placeholder-gray-400"
          />
          <button
            onClick={onCall}
            disabled={!idToCall || isCallActive || isCalling}
            className="px-6 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Phone className="w-5 h-5" />
            {isCalling ? "Calling..." : "Call"}
          </button>
        </div>
      </div>
    </>
  );
}
