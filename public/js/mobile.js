// public/js/mobile.js
document.addEventListener('DOMContentLoaded', () => {
    // Global variables
    let socket;
    let cameraView = document.getElementById('camera-view');
    let statusBar = document.getElementById('status-bar');
    let flipCameraBtn = document.getElementById('flip-camera-btn');
    let freezeFrameBtn = document.getElementById('freeze-frame-btn');
    let loadingScreen = document.getElementById('loading-screen');
    let currentStream = null;
    let isFrozen = false;
    let facingMode = 'environment'; // Start with back camera
    let sneakerImage = null;
    let sneakerAdjustments = {
        size: 1,
        positionY: 0,
        rotation: 0
    };
    let canvas = document.createElement('canvas');
    let context = canvas.getContext('2d');
    let frameInterval;
    let lastFrameTime = 0;
    const FPS = 15; // Limit frames per second to reduce bandwidth
    
    // Get server URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}?mobile=true`;
    
    // Initialize WebSocket connection
    function initWebSocket() {
        socket = new WebSocket(wsUrl);
        
        socket.onopen = () => {
            console.log('WebSocket connection established');
            setStatus('Connected to server');
            
            // Notify desktop that mobile is connected
            socket.send(JSON.stringify({
                type: 'mobile-connected'
            }));
            
            // Start camera - add a slight delay to ensure everything is initialized
            setTimeout(initCamera, 500);
        };
        
        socket.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                
                if (message.type === 'sneaker-image') {
                    console.log('Received sneaker image:', message.url);
                    loadSneakerImage(message.url);
                    setStatus('Sneaker received - Position your feet');
                }
                else if (message.type === 'sneaker-adjustment') {
                    console.log('Received sneaker adjustments:', message);
                    sneakerAdjustments = {
                        size: message.size || 1,
                        positionY: message.positionY || 0,
                        rotation: message.rotation || 0
                    };
                }
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        };
        
        socket.onclose = () => {
            console.log('WebSocket connection closed');
            setStatus('Disconnected from server');
            
            // Try to reconnect after a delay
            setTimeout(initWebSocket, 5000);
        };
        
        socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            setStatus('Connection error');
        };
    }
    
    // Initialize camera with proper error handling
    function initCamera() {
        setStatus('Requesting camera access...');
        
        if (currentStream) {
            // Stop current stream
            currentStream.getTracks().forEach(track => track.stop());
        }
        
        // Make sure we have access to mediaDevices API
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            const errorMsg = 'Camera API not available in your browser';
            console.error(errorMsg);
            setStatus(errorMsg);
            loadingScreen.innerHTML = `<p>${errorMsg}</p><p>Please try using a modern browser like Chrome or Safari</p>`;
            return;
        }
        
        const constraints = { 
            audio: false,
            video: { 
                facingMode: facingMode,
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        };
        
        navigator.mediaDevices.getUserMedia(constraints)
            .then(stream => {
                console.log('Camera access granted');
                currentStream = stream;
                cameraView.srcObject = stream;
                
                // Wait for metadata to load
                cameraView.onloadedmetadata = () => {
                    console.log('Video metadata loaded');
                    loadingScreen.style.display = 'none';
                    // Start sending frames
                    startSendingFrames();
                };
                
                setStatus('Camera active - Point at your feet');
            })
            .catch(error => {
                console.error('Error accessing camera:', error);
                let errorMsg = 'Camera access error';
                
                // More specific error messages
                if (error.name === 'NotAllowedError') {
                    errorMsg = 'Camera permission denied. Please allow camera access.';
                } else if (error.name === 'NotFoundError') {
                    errorMsg = 'No camera found on your device.';
                } else if (error.name === 'NotReadableError') {
                    errorMsg = 'Camera already in use by another application.';
                } else {
                    errorMsg = `Camera error: ${error.message}`;
                }
                
                setStatus(errorMsg);
                loadingScreen.innerHTML = `<p>${errorMsg}</p><p>Try refreshing the page or checking your browser settings.</p>`;
            });
    }
    
    // Load sneaker image
    function loadSneakerImage(url) {
        sneakerImage = new Image();
        sneakerImage.crossOrigin = 'anonymous';
        sneakerImage.onload = () => {
            console.log('Sneaker image loaded');
        };
        sneakerImage.onerror = (err) => {
            console.error('Error loading sneaker image:', err);
            setStatus('Failed to load sneaker image');
        };
        sneakerImage.src = url;
    }
    
    // Start sending frames to desktop
    function startSendingFrames() {
        if (frameInterval) {
            clearInterval(frameInterval);
        }
        
        // Resize canvas to match video dimensions
        canvas.width = cameraView.videoWidth;
        canvas.height = cameraView.videoHeight;
        
        console.log('Starting to send frames, canvas size:', canvas.width, 'x', canvas.height);
        
        frameInterval = setInterval(() => {
            if (isFrozen || !currentStream) return;
            
            const now = Date.now();
            const elapsed = now - lastFrameTime;
            
            if (elapsed >= 1000 / FPS) {
                lastFrameTime = now;
                
                try {
                    // Draw video frame to canvas
                    context.drawImage(cameraView, 0, 0, canvas.width, canvas.height);
                    
                    // Overlay sneaker if available
                    if (sneakerImage) {
                        drawSneakerOnFeet();
                    }
                    
                    // Send frame to desktop
                    if (socket && socket.readyState === WebSocket.OPEN) {
                        // Compress and convert canvas to data URL
                        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                        
                        socket.send(JSON.stringify({
                            type: 'video-frame',
                            dataUrl: dataUrl
                        }));
                    }
                } catch (error) {
                    console.error('Error processing frame:', error);
                    setStatus('Error processing camera frame');
                }
            }
        }, 1000 / FPS);
    }
    
    // Draw sneaker on feet
    function drawSneakerOnFeet() {
        // Implement basic foot detection
        const feetY = detectFeet();
        
        if (feetY) {
            // Center sneaker image on detected feet position
            const scale = sneakerAdjustments.size;
            const yOffset = sneakerAdjustments.positionY;
            const rotation = sneakerAdjustments.rotation;
            
            // Calculate position
            const sneakerWidth = sneakerImage.width * scale;
            const sneakerHeight = sneakerImage.height * scale;
            const xPos = (canvas.width - sneakerWidth) / 2;
            const yPos = feetY - (sneakerHeight / 2) + yOffset;
            
            // Apply transformations to draw rotated sneaker
            context.save();
            context.translate(canvas.width / 2, feetY + yOffset);
            context.rotate(rotation);
            context.drawImage(
                sneakerImage, 
                -sneakerWidth / 2, 
                -sneakerHeight / 2, 
                sneakerWidth, 
                sneakerHeight
            );
            context.restore();
        }
    }
    
    // Basic feet detection function
    // This is a simplified approach - real foot detection would use ML models
    function detectFeet() {
        try {
            // In a real app, use TensorFlow.js or other ML libraries for accurate detection
            // For now, we'll use a simple heuristic - assume feet are in lower third of frame
            return canvas.height * 0.75; // Default position in lower part of frame
        } catch (error) {
            console.error('Error in feet detection:', error);
            return null;
        }
    }
    
    // Toggle freeze frame
    function toggleFreezeFrame() {
        isFrozen = !isFrozen;
        freezeFrameBtn.textContent = isFrozen ? 'Resume' : 'Freeze';
        
        setStatus(isFrozen ? 'Frame frozen - Tap again to resume' : 'Camera active - Point at your feet');
    }
    
    // Toggle camera (front/back)
    function toggleCamera() {
        facingMode = facingMode === 'environment' ? 'user' : 'environment';
        initCamera();
        setStatus(`Using ${facingMode === 'environment' ? 'back' : 'front'} camera`);
    }
    
    // Set status message
    function setStatus(message) {
        statusBar.textContent = message;
        console.log('Status:', message);
    }
    
    // Set up event listeners
    flipCameraBtn.addEventListener('click', toggleCamera);
    freezeFrameBtn.addEventListener('click', toggleFreezeFrame);
    
    // Handle errors and make sure camera starts
    window.addEventListener('load', () => {
        // Keep loading screen visible until camera is initialized
        console.log('Page loaded, initializing WebSocket');
        initWebSocket();
    });
    
    // Handle page visibility changes
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            // Page is visible again, reinitialize camera if needed
            if (!currentStream || currentStream.getTracks()[0].readyState !== 'live') {
                console.log('Page visible, reinitializing camera');
                initCamera();
            }
        }
    });
});