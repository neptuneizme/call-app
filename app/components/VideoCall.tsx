"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Peer, { Instance as PeerInstance } from "simple-peer";
import { io, Socket } from "socket.io-client";
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneIncoming,
  History,
} from "lucide-react";
import { useRouter } from "next/navigation";

// Types
interface CallData {
  from: string;
  name: string;
  signal: Peer.SignalData;
  callId?: string; // Database call ID
}

interface VideoCallProps {
  socketUrl?: string;
  userName?: string;
}

export default function VideoCall({
  socketUrl = "http://localhost:3001",
  userName = "User",
}: VideoCallProps) {
  const router = useRouter();

  // Refs
  const myVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<PeerInstance | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const mySocketId = useRef<string>(""); // Store actual socket ID
  const currentCallId = useRef<string | null>(null); // Store current database call ID

  // State
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [socketId, setSocketId] = useState<string>(""); // For display
  const [callerId, setCallerId] = useState<string>("");
  const [callerName, setCallerName] = useState<string>("");
  const [callerSignal, setCallerSignal] = useState<Peer.SignalData | null>(
    null
  );
  const [receivingCall, setReceivingCall] = useState<boolean>(false);
  const [callAccepted, setCallAccepted] = useState<boolean>(false);
  const [callEnded, setCallEnded] = useState<boolean>(false);
  const [idToCall, setIdToCall] = useState<string>("");
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isVideoOff, setIsVideoOff] = useState<boolean>(false);
  const [isCalling, setIsCalling] = useState<boolean>(false);

  // Initialize camera/mic permissions and socket connection on mount
  useEffect(() => {
    // Request camera and microphone permissions immediately
    const initializeMedia = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        setStream(mediaStream);

        // Attach stream to "My Video" ref
        if (myVideoRef.current) {
          myVideoRef.current.srcObject = mediaStream;
        }
      } catch (error) {
        console.error("Error accessing media devices:", error);
        alert(
          "Please allow camera and microphone access to use video calling."
        );
      }
    };

    initializeMedia();

    // Initialize socket connection
    console.log("Attempting to connect to socket server:", socketUrl);
    const socket = io(socketUrl, {
      transports: ["polling", "websocket"], // Try polling first, then upgrade to websocket
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      const id = socket.id || "";
      mySocketId.current = id; // Store actual socket ID
      setSocketId(id); // Update display
      console.log("Connected with socket ID:", id);
    });

    socket.on("connect_error", (error) => {
      console.error("Socket connection error:", error);
    });

    socket.on("disconnect", (reason) => {
      console.log("Socket disconnected:", reason);
    });

    // Listen for incoming calls
    socket.on("callUser", (data: CallData) => {
      console.log("Receiving call from:", data.from, data.name);
      setReceivingCall(true);
      setCallerId(data.from);
      setCallerName(data.name);
      setCallerSignal(data.signal);
      // Store callId if provided by caller
      if (data.callId) {
        currentCallId.current = data.callId;
      }
    });

    // Listen for call ended by other user
    socket.on("callEnded", () => {
      handleCallEnded();
    });

    // Cleanup on unmount
    return () => {
      socket.disconnect();
      // Stop all media tracks
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socketUrl]);

  // Update video ref when stream changes
  useEffect(() => {
    if (myVideoRef.current && stream) {
      myVideoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Handle call ended cleanup
  const handleCallEnded = useCallback(async () => {
    // End call in database if we have a call ID
    if (currentCallId.current) {
      try {
        await fetch(`/api/calls/${currentCallId.current}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endCall: true }),
        });
        console.log("Call ended in database:", currentCallId.current);
      } catch (error) {
        console.error("Failed to end call in database:", error);
      }
      currentCallId.current = null;
    }

    setCallEnded(true);
    setCallAccepted(false);
    setReceivingCall(false);
    setIsCalling(false);
    setCallerSignal(null);
    setCallerId("");
    setCallerName("");

    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }, []);

  // Create a call record in database
  const createCallRecord = useCallback(async (callId: string) => {
    try {
      const response = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId }),
      });

      if (response.ok) {
        const data = await response.json();
        currentCallId.current = data.callId;
        console.log("Call record created:", data.callId);
        return data;
      } else if (response.status === 409) {
        // Call already exists, try to join
        console.log("Call exists, joining...");
        return await joinCallRecord(callId);
      }
    } catch (error) {
      console.error("Failed to create call record:", error);
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Join an existing call record
  const joinCallRecord = useCallback(async (callId: string) => {
    try {
      const response = await fetch(`/api/calls/${callId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (response.ok) {
        const data = await response.json();
        currentCallId.current = callId;
        console.log("Joined call record:", callId);
        return data;
      }
    } catch (error) {
      console.error("Failed to join call record:", error);
    }
    return null;
  }, []);

  // Call a user by their ID
  const callUser = useCallback(
    async (id: string) => {
      if (!stream || !socketRef.current) {
        console.error("Stream or socket not available");
        return;
      }

      setIsCalling(true);
      setCallEnded(false);

      // Create call record in database using the target socket ID as call ID
      const callRecordId = `call-${mySocketId.current}-${id}-${Date.now()}`;
      await createCallRecord(callRecordId);

      // Create peer as initiator
      const peer = new Peer({
        initiator: true,
        trickle: false,
        stream: stream,
      });

      peerRef.current = peer;

      // Handle signaling data
      peer.on("signal", (data: Peer.SignalData) => {
        console.log("Sending call signal to:", id);
        socketRef.current?.emit("callUser", {
          userToCall: id,
          signalData: data,
          from: mySocketId.current, // Use actual socket ID, not editable myId
          name: userName,
        });
      });

      // Handle receiving remote stream
      peer.on("stream", (remoteStream: MediaStream) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
        }
      });

      // Handle peer errors
      peer.on("error", (err) => {
        console.error("Peer error:", err);
        handleCallEnded();
      });

      // Handle peer close
      peer.on("close", () => {
        handleCallEnded();
      });

      // Listen for call acceptance
      socketRef.current.on("callAccepted", (signal: Peer.SignalData) => {
        console.log("Call accepted, signaling peer");
        setCallAccepted(true);
        setIsCalling(false);
        peer.signal(signal);
      });
    },
    [stream, userName, handleCallEnded, createCallRecord]
  );

  // Answer an incoming call
  const answerCall = useCallback(async () => {
    if (!stream || !callerSignal || !socketRef.current) {
      console.error("Stream, caller signal, or socket not available");
      return;
    }

    setCallAccepted(true);
    setCallEnded(false);

    // Join the call record if callId was provided
    if (currentCallId.current) {
      await joinCallRecord(currentCallId.current);
    }

    // Create peer as non-initiator
    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream: stream,
    });

    peerRef.current = peer;

    // Handle signaling data
    peer.on("signal", (data: Peer.SignalData) => {
      socketRef.current?.emit("answerCall", {
        signal: data,
        to: callerId,
      });
    });

    // Handle receiving remote stream
    peer.on("stream", (remoteStream: MediaStream) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
    });

    // Handle peer errors
    peer.on("error", (err) => {
      console.error("Peer error:", err);
      handleCallEnded();
    });

    // Handle peer close
    peer.on("close", () => {
      handleCallEnded();
    });

    // Signal with caller's data
    peer.signal(callerSignal);
    setReceivingCall(false);
  }, [stream, callerSignal, callerId, handleCallEnded, joinCallRecord]);

  // Leave the current call
  const leaveCall = useCallback(async () => {
    // Notify the other user
    socketRef.current?.emit("endCall", { to: callerId || idToCall });

    // End call in database
    await handleCallEnded();

    // Destroy peer connection
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }

    // Reset call-related states (but keep local camera stream active)
    setCallEnded(true);
    setCallAccepted(false);
    setReceivingCall(false);
    setIsCalling(false);
    setCallerSignal(null);
    setCallerId("");
    setCallerName("");

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }, [callerId, idToCall, handleCallEnded]);

  // Toggle microphone - physically enable/disable audio tracks
  const toggleMic = useCallback(() => {
    if (stream) {
      const audioTracks = stream.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  }, [stream, isMuted]);

  // Toggle video - physically enable/disable video tracks
  const toggleVideo = useCallback(() => {
    if (stream) {
      const videoTracks = stream.getVideoTracks();
      videoTracks.forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsVideoOff(!isVideoOff);
    }
  }, [stream, isVideoOff]);

  // Copy ID to clipboard - always copy the actual socket ID
  const copyIdToClipboard = () => {
    const idToCopy = mySocketId.current;
    if (idToCopy) {
      navigator.clipboard.writeText(idToCopy);
      alert("ID copied to clipboard!");
    } else {
      alert("No ID available yet. Please wait for connection.");
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-900 via-gray-800 to-gray-900 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header with History Button */}
        <div className="flex items-center justify-between mb-8">
          <div className="w-24"></div> {/* Spacer for centering */}
          <h1 className="text-3xl font-bold text-white text-center">
            Video Call
          </h1>
          <button
            onClick={() => router.push("/history")}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            <History className="w-5 h-5" />
            History
          </button>
        </div>

        {/* Video Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {/* My Video */}
          <div className="relative bg-gray-800 rounded-xl overflow-hidden aspect-video">
            <video
              ref={myVideoRef}
              autoPlay
              muted
              playsInline
              className={`w-full h-full object-cover ${
                isVideoOff ? "hidden" : ""
              }`}
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
            {callAccepted && !callEnded ? (
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
            {callAccepted && !callEnded && (
              <div className="absolute bottom-4 left-4 bg-black/50 px-3 py-1 rounded-full">
                <span className="text-white text-sm">
                  {callerName || "Remote User"}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex justify-center gap-4 mb-8">
          {/* Mic Toggle */}
          <button
            onClick={toggleMic}
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
            onClick={toggleVideo}
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
          {callAccepted && !callEnded ? (
            <button
              onClick={leaveCall}
              className="p-4 rounded-full bg-red-500 hover:bg-red-600 transition-colors"
              title="End call"
            >
              <PhoneOff className="w-6 h-6 text-white" />
            </button>
          ) : (
            <button
              onClick={() => callUser(idToCall)}
              disabled={!idToCall || isCalling}
              className="p-4 rounded-full bg-green-500 hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Start call"
            >
              <Phone className="w-6 h-6 text-white" />
            </button>
          )}
        </div>

        {/* My ID Section */}
        <div className="bg-gray-800 rounded-xl p-6 mb-4">
          <h2 className="text-lg font-semibold text-white mb-2">Your ID</h2>
          <p className="text-gray-400 text-sm mb-2">
            Share this ID with others so they can call you
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={socketId || "Connecting..."}
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
              onChange={(e) => setIdToCall(e.target.value)}
              placeholder="Enter user ID to call"
              className="flex-1 bg-gray-700 text-white px-4 py-2 rounded-lg placeholder-gray-400"
            />
            <button
              onClick={() => callUser(idToCall)}
              disabled={!idToCall || callAccepted || isCalling}
              className="px-6 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Phone className="w-5 h-5" />
              {isCalling ? "Calling..." : "Call"}
            </button>
          </div>
        </div>

        {/* Incoming Call Modal */}
        {receivingCall && !callAccepted && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-xl p-8 max-w-md w-full mx-4 text-center">
              <div className="mb-6">
                <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                  <PhoneIncoming className="w-10 h-10 text-green-500" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">
                  Incoming Call
                </h2>
                <p className="text-gray-400">
                  {callerName || "Someone"} is calling you
                </p>
              </div>
              <div className="flex justify-center gap-4">
                <button
                  onClick={() => {
                    setReceivingCall(false);
                    setCallerSignal(null);
                  }}
                  className="px-8 py-3 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors flex items-center gap-2"
                >
                  <PhoneOff className="w-5 h-5" />
                  Decline
                </button>
                <button
                  onClick={answerCall}
                  className="px-8 py-3 bg-green-500 hover:bg-green-600 text-white rounded-full transition-colors flex items-center gap-2"
                >
                  <Phone className="w-5 h-5" />
                  Answer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
