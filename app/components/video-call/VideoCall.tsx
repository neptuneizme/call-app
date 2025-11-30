"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Peer, { Instance as PeerInstance } from "simple-peer";
import { History } from "lucide-react";
import { useRouter } from "next/navigation";

import { VideoGrid } from "./VideoGrid";
import { CallControls } from "./CallControls";
import { CallInput } from "./CallInput";
import { IncomingCallModal } from "./IncomingCallModal";
import { RecordingIndicator } from "./RecordingIndicator";
import {
  useMediaStream,
  useSocket,
  useCallDatabase,
  useRecording,
} from "./hooks";

interface VideoCallProps {
  socketUrl?: string;
  userName?: string;
}

export function VideoCall({
  socketUrl = "http://localhost:3001",
  userName = "User",
}: VideoCallProps) {
  const router = useRouter();

  // Custom hooks
  const {
    stream,
    error: mediaError,
    isMuted,
    isVideoOff,
    toggleMic,
    toggleVideo,
  } = useMediaStream();

  const {
    socketId,
    isConnected,
    incomingCall,
    emitCallUser,
    emitAnswerCall,
    emitEndCall,
    onCallAccepted,
    onCallEnded,
    clearIncomingCall,
  } = useSocket(socketUrl);

  const { createCallRecord, joinCallRecord, endCallRecord } = useCallDatabase();

  const {
    isRecording,
    isUploading,
    recordingDuration,
    startRecording,
    stopRecording,
    uploadRecording,
  } = useRecording();

  // Refs
  const peerRef = useRef<PeerInstance | null>(null);
  const currentCallIdRef = useRef<string | null>(null);

  // Local state
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [callAccepted, setCallAccepted] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const [idToCall, setIdToCall] = useState("");
  const [isCalling, setIsCalling] = useState(false);
  const [remoteName, setRemoteName] = useState("");

  // Handle call ended cleanup
  const handleCallEnded = useCallback(async () => {
    const callIdToUse = currentCallIdRef.current;
    console.log(
      "handleCallEnded called, callId:",
      callIdToUse,
      "isRecording:",
      isRecording
    );

    // End call in database FIRST (sets to AWAITING_UPLOADS)
    if (callIdToUse) {
      await endCallRecord(callIdToUse);
    }

    // Stop recording and upload AFTER (confirm-upload will update status)
    if (isRecording) {
      console.log("Stopping recording...");
      await stopRecording();
      if (callIdToUse) {
        console.log("Uploading recording for call:", callIdToUse);
        await uploadRecording(callIdToUse);
      }
    }

    // Reset states
    setCallEnded(true);
    setCallAccepted(false);
    setIsCalling(false);
    setRemoteName("");
    setRemoteStream(null);
    currentCallIdRef.current = null;

    // Cleanup peer
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
  }, [isRecording, stopRecording, uploadRecording, endCallRecord]);

  // Register callEnded handler
  useEffect(() => {
    onCallEnded(() => {
      handleCallEnded();
    });
  }, [onCallEnded, handleCallEnded]);

  // Start recording when call is accepted
  useEffect(() => {
    if (callAccepted && stream && !isRecording) {
      startRecording(stream);
    }
  }, [callAccepted, stream, isRecording, startRecording]);

  // Call a user by their ID
  const callUser = useCallback(
    async (id: string) => {
      if (!stream) {
        console.error("Stream not available");
        return;
      }

      setIsCalling(true);
      setCallEnded(false);

      // Create call record in database
      const callRecordId = `call-${socketId}-${id}-${Date.now()}`;
      await createCallRecord(callRecordId);
      currentCallIdRef.current = callRecordId;

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
        emitCallUser({
          userToCall: id,
          signalData: data,
          from: socketId,
          name: userName,
        });
      });

      // Handle receiving remote stream
      peer.on("stream", (remoteStream: MediaStream) => {
        setRemoteStream(remoteStream);
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
      onCallAccepted((signal: Peer.SignalData) => {
        console.log("Call accepted, signaling peer");
        setCallAccepted(true);
        setIsCalling(false);
        peer.signal(signal);
      });
    },
    [
      stream,
      socketId,
      userName,
      createCallRecord,
      emitCallUser,
      onCallAccepted,
      handleCallEnded,
    ]
  );

  // Answer an incoming call
  const answerCall = useCallback(async () => {
    if (!stream || !incomingCall) {
      console.error("Stream or incoming call not available");
      return;
    }

    setCallAccepted(true);
    setCallEnded(false);
    setRemoteName(incomingCall.callerName);

    // Join the call record if callId was provided
    if (incomingCall.callId) {
      await joinCallRecord(incomingCall.callId);
      currentCallIdRef.current = incomingCall.callId;
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
      emitAnswerCall({
        signal: data,
        to: incomingCall.callerId,
      });
    });

    // Handle receiving remote stream
    peer.on("stream", (remoteStream: MediaStream) => {
      setRemoteStream(remoteStream);
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
    peer.signal(incomingCall.signal);
    clearIncomingCall();
  }, [
    stream,
    incomingCall,
    joinCallRecord,
    emitAnswerCall,
    clearIncomingCall,
    handleCallEnded,
  ]);

  // Leave the current call
  const leaveCall = useCallback(async () => {
    // Notify the other user
    const callerId = incomingCall?.callerId || idToCall;
    emitEndCall(callerId);

    // Handle cleanup
    await handleCallEnded();
  }, [incomingCall, idToCall, emitEndCall, handleCallEnded]);

  // Decline incoming call
  const declineCall = useCallback(() => {
    clearIncomingCall();
  }, [clearIncomingCall]);

  // Show media error if any
  if (mediaError) {
    return (
      <div className="min-h-screen bg-linear-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-xl p-8 max-w-md text-center">
          <h2 className="text-xl font-bold text-white mb-4">
            Camera/Microphone Access Required
          </h2>
          <p className="text-gray-400">{mediaError}</p>
        </div>
      </div>
    );
  }

  const isCallActive = callAccepted && !callEnded;

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-900 via-gray-800 to-gray-900 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          {/* Recording Indicator */}
          <div className="w-24">
            <RecordingIndicator
              isRecording={isRecording}
              duration={recordingDuration}
              isUploading={isUploading}
            />
          </div>

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
        <VideoGrid
          localStream={stream}
          remoteStream={remoteStream}
          isVideoOff={isVideoOff}
          isCallActive={isCallActive}
          isCalling={isCalling}
          remoteName={remoteName || incomingCall?.callerName}
        />

        {/* Controls */}
        <CallControls
          isMuted={isMuted}
          isVideoOff={isVideoOff}
          isCallActive={isCallActive}
          isCalling={isCalling}
          canStartCall={!!idToCall && isConnected}
          onToggleMic={toggleMic}
          onToggleVideo={toggleVideo}
          onStartCall={() => callUser(idToCall)}
          onEndCall={leaveCall}
        />

        {/* Call Input */}
        <CallInput
          mySocketId={socketId}
          idToCall={idToCall}
          isCallActive={isCallActive}
          isCalling={isCalling}
          onIdToCallChange={setIdToCall}
          onCall={() => callUser(idToCall)}
        />

        {/* Incoming Call Modal */}
        {incomingCall && !callAccepted && (
          <IncomingCallModal
            callerName={incomingCall.callerName}
            onAnswer={answerCall}
            onDecline={declineCall}
          />
        )}
      </div>
    </div>
  );
}

// Default export for backward compatibility
export default VideoCall;
