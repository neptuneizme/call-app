/**
 * Example Socket.IO Server for Video Call
 *
 * Run this server with: node server/socket-server.js
 * Make sure to install dependencies: npm install express socket.io cors
 */
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import express from "express";

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Emit the socket id to the connected user
  socket.emit("me", socket.id);

  // Handle call user event
  socket.on("callUser", (data) => {
    console.log(`Call from ${data.from} to ${data.userToCall}`);
    io.to(data.userToCall).emit("callUser", {
      signal: data.signalData,
      from: data.from,
      name: data.name,
    });
  });

  // Handle answer call event
  socket.on("answerCall", (data) => {
    console.log(`Answer call to ${data.to}`);
    io.to(data.to).emit("callAccepted", data.signal);
  });

  // Handle end call event
  socket.on("endCall", (data) => {
    io.to(data.to).emit("callEnded");
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
    socket.broadcast.emit("callEnded");
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
});
