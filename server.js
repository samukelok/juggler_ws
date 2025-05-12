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

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    
    socket.on('join-call', ({ callId, userId }) => {
        console.log(`User ${userId} joining call ${callId}`);
        
        socket.join(callId);
        socket.callId = callId;
        socket.userId = userId;
        
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
        console.log(`Offer from ${socket.userId} to ${to}`);
        socket.to(to).emit('offer', { from: socket.userId, offer });
    });
    
    socket.on('answer', ({ to, answer }) => {
        console.log(`Answer from ${socket.userId} to ${to}`);
        socket.to(to).emit('answer', { from: socket.userId, answer });
    });
    
    socket.on('ice-candidate', ({ to, candidate }) => {
        socket.to(to).emit('ice-candidate', { from: socket.userId, candidate });
    });
    
    socket.on('end-call', (callId) => {
        console.log(`Call ${callId} ended by ${socket.userId}`);
        io.to(callId).emit('call-ended');
        delete activeCalls[callId];
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
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
