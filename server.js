const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*", // Allow all origins (update this in production)
        methods: ["GET", "POST"]
    }
});

const activeCalls = {};
const userToSocket = {}; // Map userId to socketId

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    socket.on('join-call', ({ callId, userId }) => {
        console.log(`User ${userId} joining call ${callId}`);

        socket.join(callId);
        socket.callId = callId;
        socket.userId = userId;

        // Save socket ID mapping
        userToSocket[userId] = socket.id;

        // Register user in call
        if (!activeCalls[callId]) {
            activeCalls[callId] = new Set();
        }
        activeCalls[callId].add(userId);

        // Notify others in the call
        socket.to(callId).emit('user-connected', userId);

        // Send list of existing participants to the new user
        const participants = Array.from(activeCalls[callId]).filter(id => id !== userId);
        socket.emit('existing-participants', participants);
    });

    socket.on('offer', ({ to, offer }) => {
        const targetSocketId = userToSocket[to];
        if (targetSocketId) {
            io.to(targetSocketId).emit('offer', { from: socket.userId, offer });
        } else {
            console.warn(`Offer target ${to} not found`);
        }
    });

    socket.on('answer', ({ to, answer }) => {
        const targetSocketId = userToSocket[to];
        if (targetSocketId) {
            io.to(targetSocketId).emit('answer', { from: socket.userId, answer });
        } else {
            console.warn(`Answer target ${to} not found`);
        }
    });

    socket.on('ice-candidate', ({ to, candidate }) => {
        const targetSocketId = userToSocket[to];
        if (targetSocketId) {
            io.to(targetSocketId).emit('ice-candidate', { from: socket.userId, candidate });
        } else {
            console.warn(`ICE candidate target ${to} not found`);
        }
    });

    socket.on('end-call', (callId) => {
        console.log(`Call ${callId} ended by ${socket.userId}`);
        io.to(callId).emit('call-ended');
        if (activeCalls[callId]) {
            activeCalls[callId].forEach(userId => {
                delete userToSocket[userId];
            });
            delete activeCalls[callId];
        }
    });

    socket.on('disconnect', () => {
        if (socket.callId && socket.userId) {
            console.log(`User ${socket.userId} disconnected from call ${socket.callId}`);

            if (activeCalls[socket.callId]) {
                activeCalls[socket.callId].delete(socket.userId);

                if (activeCalls[socket.callId].size === 0) {
                    delete activeCalls[socket.callId];
                } else {
                    socket.to(socket.callId).emit('user-disconnected', socket.userId);
                }
            }

            delete userToSocket[socket.userId];
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
