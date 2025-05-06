// server.js - Run this with Node.js in VS Code
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Store connected clients with their roles
const clients = new Map();
let desktopClient = null;
const mobileClients = new Set();

// Handle WebSocket connections
wss.on('connection', (ws) => {
    // Assign a unique ID to each client
    const clientId = Date.now().toString();
    clients.set(ws, { id: clientId, role: 'unknown' });
    
    console.log('Client connected. Total clients:', clients.size);
    
    // Handle incoming messages
    ws.on('message', (message) => {
        try {
            const parsedMessage = JSON.parse(message);
            
            // Determine client role based on messages
            if (parsedMessage.type === 'mobile-connected') {
                const clientInfo = clients.get(ws);
                if (clientInfo) {
                    clientInfo.role = 'mobile';
                    mobileClients.add(ws);
                    
                    // Notify desktop of mobile connection
                    if (desktopClient && desktopClient.readyState === WebSocket.OPEN) {
                        desktopClient.send(JSON.stringify({
                            type: 'mobile-connected',
                            clientId: clientInfo.id
                        }));
                    }
                }
            } else if (parsedMessage.type === 'desktop-connected') {
                const clientInfo = clients.get(ws);
                if (clientInfo) {
                    clientInfo.role = 'desktop';
                    desktopClient = ws;
                }
            }
            
            // Route messages between desktop and mobile
            if (parsedMessage.type === 'video-frame') {
                // Send from mobile to desktop
                if (desktopClient && desktopClient.readyState === WebSocket.OPEN) {
                    desktopClient.send(message);
                }
            } else if (parsedMessage.type === 'sneaker-image' || parsedMessage.type === 'sneaker-adjustment') {
                // Send from desktop to all mobiles
                mobileClients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(message);
                    }
                });
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });
    
    // Handle disconnections
    ws.on('close', () => {
        const clientInfo = clients.get(ws);
        
        if (clientInfo) {
            if (clientInfo.role === 'mobile') {
                mobileClients.delete(ws);
                
                // Notify desktop of mobile disconnection
                if (desktopClient && desktopClient.readyState === WebSocket.OPEN) {
                    desktopClient.send(JSON.stringify({
                        type: 'mobile-disconnected',
                        clientId: clientInfo.id
                    }));
                }
            } else if (clientInfo.role === 'desktop') {
                desktopClient = null;
            }
        }
        
        clients.delete(ws);
        console.log('Client disconnected. Total clients:', clients.size);
    });
    
    // Send initial connection acknowledgment
    ws.send(JSON.stringify({
        type: 'connection-established',
        message: 'Successfully connected to the server',
        clientId: clientId
    }));
});

// API endpoint to upload sneaker image
app.post('/upload-sneaker', (req, res) => {
    const { imageData } = req.body;
    
    if (!imageData) {
        return res.status(400).json({ success: false, message: 'No image data provided' });
    }
    
    try {
        // Remove the data URL prefix to get just the base64 data
        const matches = imageData.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        
        if (!matches || matches.length !== 3) {
            return res.status(400).json({ success: false, message: 'Invalid image data format' });
        }
        
        const base64Data = matches[2];
        const fileType = matches[1].split('/')[1] || 'png';
        
        // Create a unique filename
        const filename = `sneaker_${Date.now()}.${fileType}`;
        const filePath = path.join(uploadsDir, filename);
        
        // Save the file
        fs.writeFile(filePath, base64Data, 'base64', (err) => {
            if (err) {
                console.error('Error saving image:', err);
                return res.status(500).json({ success: false, message: 'Error saving image' });
            }
            
            // Construct the URL
            const fileUrl = `/uploads/${filename}`;
            
            // Broadcast to mobile clients
            const broadcastMsg = JSON.stringify({
                type: 'sneaker-image',
                url: fileUrl
            });
            
            mobileClients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(broadcastMsg);
                }
            });
            
            res.json({ success: true, url: fileUrl });
        });
    } catch (error) {
        console.error('Error processing upload:', error);
        res.status(500).json({ success: false, message: 'Server error processing upload' });
    }
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/mobile', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'mobile.html'));
});

// Get local IP address
function getLocalIpAddress() {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            // Skip internal and non-IPv4 addresses
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return 'localhost';
}

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    const ipAddress = getLocalIpAddress();
    console.log(`Server running at http://${ipAddress}:${PORT}`);
    console.log(`Desktop interface: http://${ipAddress}:${PORT}`);
    console.log(`Mobile interface: http://${ipAddress}:${PORT}/mobile`);
});