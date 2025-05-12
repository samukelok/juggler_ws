// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

const activeCalls = {};

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    
    socket.on('join-call', ({ callId, userId }) => {
        socket.join(callId);
        socket.callId = callId;
        socket.userId = userId;
        
        // Add to active calls
        if (!activeCalls[callId]) {
            activeCalls[callId] = new Set();
        }
        activeCalls[callId].add(userId);
        
        // Notify others in the call
        socket.to(callId).emit('user-connected', userId);
        
        // Send list of existing participants
        const participants = Array.from(activeCalls[callId]).filter(id => id !== userId);
        socket.emit('existing-participants', participants);
        
        console.log(`User ${userId} joined call ${callId}`);
    });
    
    socket.on('request-participants', (callId) => {
        const participants = activeCalls[callId] ? 
            Array.from(activeCalls[callId]).filter(id => id !== socket.userId) : [];
        socket.emit('existing-participants', participants);
    });
    
    socket.on('offer', ({ to, offer }) => {
        socket.to(to).emit('offer', { from: socket.userId, offer });
    });
    
    socket.on('answer', ({ to, answer }) => {
        socket.to(to).emit('answer', { from: socket.userId, answer });
    });
    
    socket.on('ice-candidate', ({ to, candidate }) => {
        socket.to(to).emit('ice-candidate', { from: socket.userId, candidate });
    });
    
    socket.on('end-call', (callId) => {
        io.to(callId).emit('call-ended');
        delete activeCalls[callId];
    });
    
    socket.on('disconnect', () => {
        if (socket.callId && socket.userId) {
            if (activeCalls[socket.callId]) {
                activeCalls[socket.callId].delete(socket.userId);
                if (activeCalls[socket.callId].size === 0) {
                    delete activeCalls[socket.callId];
                }
            }
            socket.to(socket.callId).emit('user-disconnected', socket.userId);
            console.log(`User ${socket.userId} left call ${socket.callId}`);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
