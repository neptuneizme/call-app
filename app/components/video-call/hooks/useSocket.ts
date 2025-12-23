"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import type Peer from "simple-peer";

interface CallData {
  from: string;
  name: string;
  signal: Peer.SignalData;
  callId?: string;
}

interface IncomingCall {
  callerId: string;
  callerName: string;
  signal: Peer.SignalData;
  callId?: string;
}

interface UseSocketReturn {
  socketId: string;
  isConnected: boolean;
  incomingCall: IncomingCall | null;
  emitCallUser: (data: {
    userToCall: string;
    signalData: Peer.SignalData;
    from: string;
    name: string;
    callId?: string;
  }) => void;
  emitAnswerCall: (data: { signal: Peer.SignalData; to: string }) => void;
  emitEndCall: (to: string) => void;
  onCallAccepted: (callback: (signal: Peer.SignalData) => void) => void;
  onCallEnded: (callback: () => void) => void;
  clearIncomingCall: () => void;
}

export function useSocket(socketUrl: string): UseSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [socketId, setSocketId] = useState("");
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const callAcceptedCallbackRef = useRef<
    ((signal: Peer.SignalData) => void) | null
  >(null);
  const callEndedCallbackRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    console.log("Attempting to connect to socket server:", socketUrl);

    const socket = io(socketUrl, {
      transports: ["polling", "websocket"],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      const id = socket.id || "";
      setSocketId(id);
      setIsConnected(true);
      console.log("Connected with socket ID:", id);
    });

    socket.on("connect_error", (error) => {
      console.error("Socket connection error:", error);
      setIsConnected(false);
    });

    socket.on("disconnect", (reason) => {
      console.log("Socket disconnected:", reason);
      setIsConnected(false);
    });

    // Listen for incoming calls
    socket.on("callUser", (data: CallData) => {
      console.log("Receiving call from:", data.from, data.name);
      setIncomingCall({
        callerId: data.from,
        callerName: data.name,
        signal: data.signal,
        callId: data.callId,
      });
    });

    // Listen for call accepted
    socket.on("callAccepted", (signal: Peer.SignalData) => {
      if (callAcceptedCallbackRef.current) {
        callAcceptedCallbackRef.current(signal);
      }
    });

    // Listen for call ended by other user
    socket.on("callEnded", () => {
      if (callEndedCallbackRef.current) {
        callEndedCallbackRef.current();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [socketUrl]);

  const emitCallUser = useCallback(
    (data: {
      userToCall: string;
      signalData: Peer.SignalData;
      from: string;
      name: string;
      callId?: string;
    }) => {
      socketRef.current?.emit("callUser", data);
    },
    []
  );

  const emitAnswerCall = useCallback(
    (data: { signal: Peer.SignalData; to: string }) => {
      socketRef.current?.emit("answerCall", data);
    },
    []
  );

  const emitEndCall = useCallback((to: string) => {
    socketRef.current?.emit("endCall", { to });
  }, []);

  const onCallAccepted = useCallback(
    (callback: (signal: Peer.SignalData) => void) => {
      callAcceptedCallbackRef.current = callback;
    },
    []
  );

  const onCallEnded = useCallback((callback: () => void) => {
    callEndedCallbackRef.current = callback;
  }, []);

  const clearIncomingCall = useCallback(() => {
    setIncomingCall(null);
  }, []);

  return {
    socketId,
    isConnected,
    incomingCall,
    emitCallUser,
    emitAnswerCall,
    emitEndCall,
    onCallAccepted,
    onCallEnded,
    clearIncomingCall,
  };
}
