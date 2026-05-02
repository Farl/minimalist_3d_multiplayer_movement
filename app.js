import * as THREE from "three";
import { PlayerControls } from "./controls.js";
import { createBarriers, createTrees, createClouds } from "./worldGeneration.js";
import * as CANNON from "cannon-es";
import { Vehicle } from "./vehicle.js";
import { WebsimSocket } from "websim-socket";
import { PARTYKIT_HOST } from "./env.js";

// Simple seeded random number generator
class MathRandom {
  constructor(seed) {
    this.seed = seed;
  }
  
  random() {
    const x = Math.sin(this.seed++) * 10000;
    return x - Math.floor(x);
  }
}

async function main() {
  // Initialize WebsimSocket for multiplayer functionality
  const room = new WebsimSocket({
    host: PARTYKIT_HOST,
    room: "minimalist-3d-movement-lobby",
  });
  await room.initialize();
  
  // Generate a random player name if not available
  const playerInfo = room.peers[room.clientId] || {};
  const playerName = playerInfo.username || `Player${Math.floor(Math.random() * 1000)}`;
  
  // Safe initial position values
  const playerX = (Math.random() * 10) - 5;
  const playerZ = (Math.random() * 10) - 5;

  // Setup Three.js scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB); // Light sky blue background
  
  // Create barriers, trees, clouds and platforms
  createBarriers(scene);
  createTrees(scene);
  createClouds(scene);
  
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('game-container').appendChild(renderer.domElement);
  
  // Initialize physics world
  const physicsWorld = new CANNON.World({
    gravity: new CANNON.Vec3(0, -9.82, 0),
  });

  // Create a ground body with a static plane
  const groundBody = new CANNON.Body({
    type: CANNON.Body.STATIC,
    shape: new CANNON.Plane(),
  });
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  physicsWorld.addBody(groundBody);
  
  // Object to store other players
  const otherPlayers = {};
  const playerLabels = {};
  const chatMessages = {};
  
  // Create vehicle instead of player model
  const playerVehicle = new Vehicle(scene, physicsWorld);
  playerVehicle.setPosition(playerX, 1, playerZ);
  
  // Initialize player controls with vehicle
  const playerControls = new PlayerControls(scene, room, {
    renderer: renderer,
    initialPosition: {
      x: playerX,
      y: 1,
      z: playerZ
    },
    playerModel: null, // We're not using the old player model
    vehicle: playerVehicle // Pass the vehicle to controls
  });
  const camera = playerControls.getCamera();
  
  // Ambient light
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);
  
  // Directional light (sun)
  const dirLight = new THREE.DirectionalLight(0xffffff, 1);
  dirLight.position.set(5, 10, 5);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 50;
  dirLight.shadow.camera.left = -25;
  dirLight.shadow.camera.right = 25;
  dirLight.shadow.camera.top = 25;
  dirLight.shadow.camera.bottom = -25;
  scene.add(dirLight);
  
  // Ground
  const groundGeometry = new THREE.PlaneGeometry(150, 150);
  const groundMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x55aa55,
    roughness: 0.8,
    metalness: 0.2
  });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2; // Rotate to horizontal
  ground.receiveShadow = true;
  scene.add(ground);

  // Grid helper for better spatial awareness
  const gridHelper = new THREE.GridHelper(150, 150);
  scene.add(gridHelper);
  
  // Create DOM element for player name label
  function createPlayerLabel(playerId, username) {
    const label = document.createElement('div');
    label.className = 'player-name';
    label.textContent = username;
    document.getElementById('game-container').appendChild(label);
    return label;
  }
  
  // Create DOM element for chat message
  function createChatMessage(playerId) {
    const message = document.createElement('div');
    message.className = 'chat-message';
    message.style.display = 'none';
    document.getElementById('game-container').appendChild(message);
    return message;
  }
  
  // Create chat input container
  const chatInputContainer = document.createElement('div');
  chatInputContainer.id = 'chat-input-container';
  const chatInput = document.createElement('input');
  chatInput.id = 'chat-input';
  chatInput.type = 'text';
  chatInput.maxLength = 100;
  chatInput.placeholder = 'Type a message...';
  chatInputContainer.appendChild(chatInput);
  
  // Add close button for chat input
  const closeChat = document.createElement('div');
  closeChat.id = 'close-chat';
  closeChat.innerHTML = '✕';
  chatInputContainer.appendChild(closeChat);
  
  document.getElementById('game-container').appendChild(chatInputContainer);
  
  // Create chat button for all devices
  const chatButton = document.createElement('div');
  chatButton.id = 'chat-button';
  chatButton.innerText = 'CHAT';
  document.getElementById('game-container').appendChild(chatButton);
  
  // Chat event listeners
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && chatInputContainer.style.display !== 'block') {
      e.preventDefault();
      openChatInput();
    } else if (e.key === 'Escape' && chatInputContainer.style.display === 'block') {
      closeChatInput();
    } else if (e.key === 'Enter' && chatInputContainer.style.display === 'block') {
      sendChatMessage();
    }
  });
  
  closeChat.addEventListener('click', () => {
    closeChatInput();
  });
  
  chatButton.addEventListener('click', (e) => {
    e.preventDefault();
    if (chatInputContainer.style.display === 'block') {
      closeChatInput();
    } else {
      openChatInput();
    }
  });
  
  function openChatInput() {
    chatInputContainer.style.display = 'block';
    chatInput.focus();
    
    // Disable player controls while chatting
    if (playerControls) {
      playerControls.enabled = false;
    }
  }
  
  function closeChatInput() {
    chatInputContainer.style.display = 'none';
    chatInput.value = '';
    
    // Re-enable player controls
    if (playerControls) {
      playerControls.enabled = true;
    }
  }
  
  function sendChatMessage() {
    const message = chatInput.value.trim();
    if (message) {
      // Send chat message to all players
      room.updatePresence({
        chat: {
          message: message,
          timestamp: Date.now()
        }
      });
      
      // Show message for local player too
      chatMessages[room.clientId].textContent = message;
      chatMessages[room.clientId].style.display = 'block';
      
      // Hide message after 5 seconds
      setTimeout(() => {
        if (chatMessages[room.clientId]) {
          chatMessages[room.clientId].style.display = 'none';
        }
      }, 5000);
      
      // Clear and close input
      chatInput.value = '';
      closeChatInput();
    }
  }
  
  chatInput.addEventListener('keydown', (e) => {
    e.stopPropagation(); // Prevent movement keys from triggering while typing
    if (e.key === 'Enter') {
      sendChatMessage();
    } else if (e.key === 'Escape') {
      closeChatInput();
    }
  });
  
  // Update presence subscription to handle vehicle data
  room.subscribePresence((presence) => {
    for (const clientId in presence) {
      if (clientId === room.clientId) continue; // Skip self
      
      const playerData = presence[clientId];
      if (!playerData) continue;
      
      // Create new player if needed
      if (!otherPlayers[clientId] && playerData.x !== undefined && playerData.z !== undefined) {
        const peerInfo = room.peers[clientId] || {};
        const peerName = peerInfo.username || `Player${clientId.substring(0, 4)}`;
        
        // Simplified vehicle creation - just a static mesh
        const vehicle = new Vehicle(scene, physicsWorld);
        vehicle.setPosition(playerData.x, playerData.y || 1, playerData.z);
        
        // Disable physics dynamics for remote players
        vehicle.carBody.type = CANNON.Body.STATIC;
        vehicle.wheelBodies.forEach(wheelBody => {
          wheelBody.type = CANNON.Body.STATIC;
        });
        
        otherPlayers[clientId] = vehicle;
        
        // Create name label
        playerLabels[clientId] = createPlayerLabel(clientId, peerName);
        
        // Create chat message element
        chatMessages[clientId] = createChatMessage(clientId);
      }
      
      // Update existing player
      else if (otherPlayers[clientId] && playerData.x !== undefined && playerData.z !== undefined) {
        // Simply set position without complex dynamics
        otherPlayers[clientId].setPosition(playerData.x, playerData.y || 1, playerData.z);
        
        // Update chat message if present
        if (playerData.chat && playerData.chat.message) {
          chatMessages[clientId].textContent = playerData.chat.message;
          chatMessages[clientId].style.display = 'block';
          
          // Hide message after 5 seconds
          setTimeout(() => {
            if (chatMessages[clientId]) {
              chatMessages[clientId].style.display = 'none';
            }
          }, 5000);
        }
      }
    }
    
    // Remove disconnected players
    for (const clientId in otherPlayers) {
      if (!presence[clientId]) {
        // Remove vehicle from scene
        otherPlayers[clientId].carMesh.parent.remove(otherPlayers[clientId].carMesh);
        otherPlayers[clientId].wheelMeshes.forEach(wheel => {
          wheel.parent.remove(wheel);
        });
        delete otherPlayers[clientId];
        
        if (playerLabels[clientId]) {
          document.getElementById('game-container').removeChild(playerLabels[clientId]);
          delete playerLabels[clientId];
        }
        
        if (chatMessages[clientId]) {
          document.getElementById('game-container').removeChild(chatMessages[clientId]);
          delete chatMessages[clientId];
        }
      }
    }
  });

  // Create a chat message element for local player
  chatMessages[room.clientId] = createChatMessage(room.clientId);

  // Animation loop
  function animate() {
    requestAnimationFrame(animate);
    
    // Step physics world
    physicsWorld.step(1/60);
    
    // Update player vehicle and controls
    playerVehicle.update();
    playerControls.update();
    
    // Update other players' vehicles
    for (const clientId in otherPlayers) {
      if (otherPlayers[clientId].update) {
        otherPlayers[clientId].update();
      }
      
      if (playerLabels[clientId] && otherPlayers[clientId]) {
        const vehiclePos = otherPlayers[clientId].getPosition();
        const position = new THREE.Vector3(vehiclePos.x, vehiclePos.y + 1.5, vehiclePos.z);
        const screenPosition = getScreenPosition(position, camera, renderer);
        if (screenPosition) {
          playerLabels[clientId].style.left = `${screenPosition.x}px`;
          playerLabels[clientId].style.top = `${screenPosition.y - 20}px`;
          playerLabels[clientId].style.display = screenPosition.visible ? 'block' : 'none';
          
          // Position chat message above name label
          if (chatMessages[clientId]) {
            chatMessages[clientId].style.left = `${screenPosition.x}px`;
            chatMessages[clientId].style.top = `${screenPosition.y - 45}px`;
            // Only show if visible and has content
            if (chatMessages[clientId].textContent && screenPosition.visible) {
              chatMessages[clientId].style.display = 'block';
            }
          }
        } else {
          playerLabels[clientId].style.display = 'none';
          if (chatMessages[clientId]) {
            chatMessages[clientId].style.display = 'none';
          }
        }
      }
    }
    
    // Update local player's chat message position
    if (chatMessages[room.clientId] && playerVehicle) {
      const vehiclePos = playerVehicle.getPosition();
      const position = new THREE.Vector3(vehiclePos.x, vehiclePos.y + 1.5, vehiclePos.z);
      const screenPosition = getScreenPosition(position, camera, renderer);
      if (screenPosition && chatMessages[room.clientId].textContent) {
        chatMessages[room.clientId].style.left = `${screenPosition.x}px`;
        chatMessages[room.clientId].style.top = `${screenPosition.y - 45}px`;
        chatMessages[room.clientId].style.display = screenPosition.visible ? 'block' : 'none';
      } else {
        chatMessages[room.clientId].style.display = 'none';
      }
    }
    
    renderer.render(scene, camera);
  }
  
  // Helper function to convert 3D position to screen coordinates
  function getScreenPosition(position, camera, renderer) {
    const vector = new THREE.Vector3();
    const widthHalf = renderer.domElement.width / 2;
    const heightHalf = renderer.domElement.height / 2;
    
    // Get the position adjusted to account for player height
    vector.copy(position);
    vector.y += 1.5; // Position above the player's head
    
    // Project to screen space
    vector.project(camera);
    
    // Calculate whether object is in front of the camera
    const isInFront = vector.z < 1;
    
    // Convert to screen coordinates
    return {
      x: (vector.x * widthHalf) + widthHalf,
      y: -(vector.y * heightHalf) + heightHalf,
      visible: isInFront
    };
  }

  animate();
}

main();