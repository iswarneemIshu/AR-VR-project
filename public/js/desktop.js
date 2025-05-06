// public/js/desktop.js
document.addEventListener('DOMContentLoaded', () => {
    // Global variables
    let socket;
    let scene, camera, renderer;
    let sneakerModel;
    let currentSneakerUrl = '';
    let isMobileConnected = false;
    let mobileStream = document.getElementById('mobile-stream');
    let canvas = document.getElementById('ar-canvas');
    let connectionStatus = document.getElementById('connection-status');
    let statusMessage = document.getElementById('status-message');
    let loadingOverlay = document.getElementById('loading-overlay');
    
    // Get server URL
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${protocol}//${window.location.host}`;
const mobileUrl = `${window.location.protocol}//${window.location.host}/mobile`;

document.getElementById('mobile-url').textContent = mobileUrl;

// Generate QR code
new QRCode(document.getElementById('qrcode'), {
    text: mobileUrl,
    width: 128,
    height: 128,
    colorDark: '#000000',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H
});

// Initialize WebSocket connection
function initWebSocket() {
    socket = new WebSocket(wsUrl);
    
    socket.onopen = () => {
        console.log('WebSocket connection established');
        showStatus('Connected to server');
        setConnectionStatus(false);
    };
        
        socket.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                
                if (message.type === 'mobile-connected') {
                    console.log('Mobile device connected');
                    showStatus('Mobile device connected');
                    setConnectionStatus(true);
                }
                else if (message.type === 'mobile-disconnected') {
                    console.log('Mobile device disconnected');
                    showStatus('Mobile device disconnected');
                    setConnectionStatus(false);
                }
                else if (message.type === 'video-frame') {
                    // Update video frame from mobile
                    if (!mobileStream.srcObject) {
                        handleFirstFrame();
                    }
                    mobileStream.src = message.dataUrl;
                }
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        };
        
        socket.onclose = () => {
            console.log('WebSocket connection closed');
            showStatus('Disconnected from server', 'error');
            setConnectionStatus(false);
            
            // Try to reconnect after a delay
            setTimeout(initWebSocket, 5000);
        };
        
        socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            showStatus('Connection error', 'error');
        };
    }
    
    // Handle first video frame
    function handleFirstFrame() {
        loadingOverlay.style.display = 'none';
        initThreeJS();
    }
    
    // Initialize Three.js scene
    function initThreeJS() {
        // Setup Three.js scene, camera, renderer
        scene = new THREE.Scene();
        
        // Perspective camera
        camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
        camera.position.z = 5;
        
        // Renderer
        renderer = new THREE.WebGLRenderer({ 
            canvas: canvas,
            alpha: true 
        });
        renderer.setSize(canvas.clientWidth, canvas.clientHeight);
        
        // Add lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(0, 10, 5);
        scene.add(directionalLight);
        
        // Handle window resize
        window.addEventListener('resize', () => {
            camera.aspect = canvas.clientWidth / canvas.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(canvas.clientWidth, canvas.clientHeight);
        });
        
        // Start rendering loop
        animate();
    }
    
    // Process the sneaker image
    function processSneakerImage(imageUrl) {
        if (!imageUrl) {
            showStatus('No sneaker image provided', 'error');
            return;
        }
        
        showStatus('Processing sneaker image...');
        
        // Send sneaker to mobile device
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'sneaker-image',
                url: imageUrl
            }));
        }
        
        // Create a 3D model from the sneaker image
        const textureLoader = new THREE.TextureLoader();
        textureLoader.load(
            imageUrl,
            texture => {
                // Remove existing sneaker model if any
                if (sneakerModel) {
                    scene.remove(sneakerModel);
                }
                
                // Create a plane with the sneaker texture
                const aspectRatio = texture.image.width / texture.image.height;
                const geometry = new THREE.PlaneGeometry(2 * aspectRatio, 2);
                const material = new THREE.MeshBasicMaterial({ 
                    map: texture,
                    transparent: true,
                    alphaTest: 0.5
                });
                
                sneakerModel = new THREE.Mesh(geometry, material);
                scene.add(sneakerModel);
                
                // Initial position
                updateSneakerPosition();
                
                currentSneakerUrl = imageUrl;
                showStatus('Sneaker loaded! Position your feet in the camera view.');
            },
            undefined,
            error => {
                console.error('Error loading sneaker texture:', error);
                showStatus('Failed to load sneaker image', 'error');
            }
        );
    }
    
    // Update sneaker position based on user adjustments
    function updateSneakerPosition() {
        if (!sneakerModel) return;
        
        // Apply user adjustments
        const sizeScale = parseFloat(document.getElementById('size-slider').value);
        const positionYOffset = parseFloat(document.getElementById('position-y-slider').value);
        const rotation = parseFloat(document.getElementById('rotation-slider').value) * (Math.PI / 180);
        
        // Update sneaker model
        sneakerModel.position.y = positionYOffset;
        sneakerModel.rotation.z = rotation;
        sneakerModel.scale.set(sizeScale, sizeScale, sizeScale);
        
        // Send adjustment to mobile
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'sneaker-adjustment',
                size: sizeScale,
                positionY: positionYOffset,
                rotation: rotation
            }));
        }
    }
    
    // Animation loop
    function animate() {
        requestAnimationFrame(animate);
        
        if (renderer && scene && camera) {
            renderer.render(scene, camera);
        }
    }
    
    // Set connection status
    function setConnectionStatus(connected) {
        isMobileConnected = connected;
        connectionStatus.textContent = connected ? 'Mobile Connected' : 'Waiting for Mobile';
        connectionStatus.className = connected ? 'connection-status connected' : 'connection-status';
        
        if (!connected) {
            loadingOverlay.style.display = 'flex';
        } else {
            loadingOverlay.style.display = 'none';
        }
    }
    
    // Helper function to show status messages
    function showStatus(message, type = 'info') {
        statusMessage.textContent = message;
        statusMessage.style.borderLeftColor = type === 'error' ? '#f44336' : '#4CAF50';
    }
    
    // Setup event listeners
    function setupEventListeners() {
        // File upload
        const sneakerInput = document.getElementById('sneaker-input');
        sneakerInput.addEventListener('change', event => {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = e => {
                    const previewDiv = document.getElementById('sneaker-preview');
                    previewDiv.innerHTML = `<img src="${e.target.result}" alt="Sneaker Preview">`;
                    
                    // Upload to server
                    fetch('/upload-sneaker', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            imageData: e.target.result
                        })
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            processSneakerImage(data.url);
                        }
                    })
                    .catch(error => {
                        console.error('Error uploading sneaker:', error);
                        showStatus('Error uploading sneaker image', 'error');
                    });
                };
                reader.readAsDataURL(file);
            }
        });
        
        // Process button
        document.getElementById('process-btn').addEventListener('click', () => {
            const previewDiv = document.getElementById('sneaker-preview');
            const previewImg = previewDiv.querySelector('img');
            if (previewImg && previewImg.src) {
                processSneakerImage(previewImg.src);
            } else {
                showStatus('Please upload a sneaker image first', 'error');
            }
        });
        
        // Load URL button
        document.getElementById('load-url-btn').addEventListener('click', () => {
            const urlInput = document.getElementById('sneaker-url');
            const imageUrl = urlInput.value.trim();
            if (imageUrl) {
                // Preview the image
                const previewDiv = document.getElementById('sneaker-preview');
                previewDiv.innerHTML = `<img src="${imageUrl}" alt="Sneaker Preview">`;
                
                // Process the image
                processSneakerImage(imageUrl);
            } else {
                showStatus('Please enter a valid image URL', 'error');
            }
        });
        
        // Sliders for adjustments
        document.getElementById('size-slider').addEventListener('input', updateSneakerPosition);
        document.getElementById('position-y-slider').addEventListener('input', updateSneakerPosition);
        document.getElementById('rotation-slider').addEventListener('input', updateSneakerPosition);
    }
    
    // Initialize the app
    initWebSocket();
    setupEventListeners();
});