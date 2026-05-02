import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class Vehicle {
  constructor(scene, physicsWorld, options = {}) {
    this.scene = scene;
    this.physicsWorld = physicsWorld;
    this.isRemote = options.isRemote || false;
    this.vehicle = null;
    this.carBody = null;
    this.wheelBodies = [];
    this.wheelMeshes = [];
    this.carMesh = null;
    this.axisHelper = null; 
    this.maxSteerVal = Math.PI / 16;
    this.maxForce = 50; 
    this.chassisMass = 50;
    this.wheelMass = 5;
    
    this.init();
  }
  
  init() {
    if (this.isRemote) {
      this.createCarMesh();
      return;
    }

    // Create physics world if not provided
    if (!this.physicsWorld) {
      this.physicsWorld = new CANNON.World({
        gravity: new CANNON.Vec3(0, -9.82, 0),
      });
      
      // Create a ground body with a static plane
      const groundBody = new CANNON.Body({
        type: CANNON.Body.STATIC,
        shape: new CANNON.Plane(),
      });
      // Rotate ground body by 90 degrees
      groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
      this.physicsWorld.addBody(groundBody);
    }
    
    // Create car chassis aligned with X axis forward
    this.carBody = new CANNON.Body({
      mass: this.chassisMass,
      position: new CANNON.Vec3(0, 0.5, 0),
      // Box dimensions aligned with X forward
      shape: new CANNON.Box(new CANNON.Vec3(1.5, 0.3, 0.8)),
      // Add angular damping to reduce spinning
      angularDamping: 0.8,
      // Lower linear damping for smoother movement
      linearDamping: 0.1
    });

    // Increase body friction for better grip
    const bodyMaterial = new CANNON.Material('body');
    bodyMaterial.friction = 0.8;
    this.carBody.material = bodyMaterial;
    
    // Create the vehicle
    this.vehicle = new CANNON.RigidVehicle({
      chassisBody: this.carBody,
    });
    
    // Add wheels
    this.addWheels();
    
    // Create car mesh
    this.createCarMesh();
    
    // Create and add axis helper to the car
    this.axisHelper = new THREE.AxesHelper(3); 
    if (this.carMesh) {
      this.carMesh.add(this.axisHelper);
    }
    
    // Add vehicle to physics world
    this.vehicle.addToWorld(this.physicsWorld);
  }

  addWheels() {
    const wheelShape = new CANNON.Sphere(0.4);
    const wheelMaterial = new CANNON.Material('wheel');
    // Increase wheel friction and restitution
    wheelMaterial.friction = 1.0;
    wheelMaterial.restitution = 0.3;

    const down = new CANNON.Vec3(0, -1, 0);
    const axisWidth = 1.6; // Reduced from 2 to lower center of gravity
    
    // Adjust wheel positions for better stability
    const wheelPositions = [
      new CANNON.Vec3(-1, -0.3, axisWidth/2),   // Back left
      new CANNON.Vec3(-1, -0.3, -axisWidth/2),  // Back right
      new CANNON.Vec3(1, -0.3, axisWidth/2),    // Front left
      new CANNON.Vec3(1, -0.3, -axisWidth/2),   // Front right
    ];

    for(let i = 0; i < 4; i++) {
      const wheelBody = new CANNON.Body({ 
        mass: this.wheelMass,
        material: wheelMaterial,
        // Add angular damping to wheels
        angularDamping: 0.5,
        linearDamping: 0.3
      });
      wheelBody.addShape(wheelShape);

      this.vehicle.addWheel({
        body: wheelBody,
        position: wheelPositions[i],
        axis: new CANNON.Vec3(0, 0, 1),
        direction: down,
        // Increased suspension for better stability
        suspensionStiffness: 30,
        suspensionRestLength: 0.3,
        frictionSlip: 2,
        rollInfluence: 0.1,
        // Add side friction to prevent sliding
        sideFragtion: 2
      });
      this.wheelBodies.push(wheelBody);
    }
  }

  update() {
    if (!this.carMesh) return;
    if (this.isRemote || !this.vehicle) return;
    
    const euler = new CANNON.Vec3();
    this.carBody.quaternion.toEuler(euler);
    
    // Get current velocity
    const velocity = this.carBody.velocity.length();
    
    // Check for excessive tilt and correct more aggressively at high speeds
    if (Math.abs(euler.z) > Math.PI / 4 || Math.abs(euler.x) > Math.PI / 4) {
      // Apply stronger correction at higher speeds
      const correctionFactor = Math.min(1 + velocity * 0.1, 2);
      
      this.carBody.angularVelocity.set(0, 0, 0);
      this.carBody.quaternion.setFromEuler(0, euler.y, 0);
      
      // Add upward force based on speed
      const upForce = this.chassisMass * (9.82 * correctionFactor);
      const upVector = new CANNON.Vec3(0, upForce, 0);
      this.carBody.applyImpulse(upVector, this.carBody.position);
      
      // Add stabilizing torque
      const torque = new CANNON.Vec3(
        -this.carBody.angularVelocity.x * this.chassisMass * 0.5,
        0,
        -this.carBody.angularVelocity.z * this.chassisMass * 0.5
      );
      this.carBody.torque.copy(torque);
    }
    
    // Apply additional downforce at high speeds
    if (velocity > 10) {
      const downforce = new CANNON.Vec3(0, -velocity * 0.5, 0);
      this.carBody.applyForce(downforce, this.carBody.position);
    }
    
    this.carMesh.position.copy(this.carBody.position);
    this.carMesh.quaternion.copy(this.carBody.quaternion);
    
    for (let i = 0; i < this.wheelMeshes.length; i++) {
      this.wheelMeshes[i].position.copy(this.wheelBodies[i].position);
      this.wheelMeshes[i].quaternion.copy(this.wheelBodies[i].quaternion);
    }
  }

  applyControls(forward, backward, left, right, steeringInput = null) {
    if (!this.vehicle) return;
    
    const velocity = this.carBody.velocity.length();
    
    // Reduce steering sensitivity at higher speeds
    const speedFactor = Math.max(1 - velocity * 0.02, 0.4);
    const steerMultiplier = 0.5 * speedFactor;
    
    // Apply steering with speed-based adjustment
    if (steeringInput !== null) {
      const steerAngle = this.maxSteerVal * steeringInput * speedFactor;
      this.vehicle.setSteeringValue(steerAngle, 2);
      this.vehicle.setSteeringValue(steerAngle, 3);
    } else {
      if (left) {
        this.vehicle.setSteeringValue(this.maxSteerVal * steerMultiplier, 2);
        this.vehicle.setSteeringValue(this.maxSteerVal * steerMultiplier, 3);
      } else if (right) {
        this.vehicle.setSteeringValue(-this.maxSteerVal * steerMultiplier, 2);
        this.vehicle.setSteeringValue(-this.maxSteerVal * steerMultiplier, 3);
      } else {
        this.vehicle.setSteeringValue(0, 2);
        this.vehicle.setSteeringValue(0, 3);
      }
    }

    // Apply force based on vehicle orientation
    const forceMultiplier = velocity > 0 ? 1 : -1;
    
    if (forward) {
      this.vehicle.setWheelForce(this.maxForce * forceMultiplier, 0);
      this.vehicle.setWheelForce(this.maxForce * forceMultiplier, 1);
    } else if (backward) {
      this.vehicle.setWheelForce(-this.maxForce * forceMultiplier * 0.6, 0);
      this.vehicle.setWheelForce(-this.maxForce * forceMultiplier * 0.6, 1);
    } else {
      this.vehicle.setWheelForce(0, 0);
      this.vehicle.setWheelForce(0, 1);
    }
  }

  resetControls() {
    if (!this.vehicle) return;
    
    this.vehicle.setWheelForce(0, 0);
    this.vehicle.setWheelForce(0, 1);
    this.vehicle.setSteeringValue(0, 0);
    this.vehicle.setSteeringValue(0, 1);
  }
  
  getPosition() {
    if (this.isRemote && this.carMesh) {
      return {
        x: this.carMesh.position.x,
        y: this.carMesh.position.y,
        z: this.carMesh.position.z
      };
    }

    if (!this.carBody) return { x: 0, y: 0, z: 0 };
    return {
      x: this.carBody.position.x,
      y: this.carBody.position.y,
      z: this.carBody.position.z
    };
  }
  
  getRotation() {
    if (this.isRemote && this.carMesh) {
      return this.carMesh.rotation.y;
    }

    if (!this.carBody) return 0;
    const euler = new CANNON.Vec3();
    this.carBody.quaternion.toEuler(euler);
    return euler.y;
  }

  setTransform(x, y, z, rotation = 0) {
    if (this.isRemote && this.carMesh) {
      this.carMesh.position.set(x, y, z);
      this.carMesh.rotation.set(0, rotation, 0);
      return;
    }

    this.setPosition(x, y, z);
    if (this.carBody) {
      this.carBody.quaternion.setFromEuler(0, rotation, 0);
    }
  }
  
  setPosition(x, y, z) {
    if (this.isRemote && this.carMesh) {
      this.carMesh.position.set(x, y, z);
      return;
    }

    if (!this.carBody) return;
    this.carBody.position.set(x, y, z);
    
    for (let i = 0; i < this.wheelBodies.length; i++) {
      const wheel = this.vehicle.wheelBodies[i];
      if (!wheel || !this.vehicle.wheelOffsets || !this.vehicle.wheelOffsets[i]) continue;
      
      const localPos = this.vehicle.wheelOffsets[i];
      
      const worldPos = new CANNON.Vec3();
      this.carBody.pointToWorldFrame(localPos, worldPos);
      wheel.position.set(worldPos.x, worldPos.y, worldPos.z);
      
      if (this.vehicle.wheelQuaternions && this.vehicle.wheelQuaternions[i]) {
        const rot = new CANNON.Quaternion();
        this.carBody.quaternion.mult(this.vehicle.wheelQuaternions[i], rot);
        wheel.quaternion.copy(rot);
      }
    }
  }
  
  manualFlip() {
    if (!this.carBody) return;
    
    const euler = new CANNON.Vec3();
    this.carBody.quaternion.toEuler(euler);
    
    this.carBody.angularVelocity.set(0, 0, 0);
    this.carBody.quaternion.setFromEuler(0, euler.y, 0);
    
    this.carBody.position.y += 0.3;
    
    if (Math.abs(euler.x) > Math.PI / 2 || Math.abs(euler.z) > Math.PI / 2) {
      const upVector = new CANNON.Vec3(0, this.chassisMass * 0.5, 0);
      this.carBody.applyImpulse(upVector, this.carBody.position);
    }
  }
  
  step() {
    if (this.physicsWorld) {
      this.physicsWorld.step(1/60);
    }
  }

  createCarMesh() {
    // Rotate car geometry 90 degrees to align with X axis forward
    const carGeometry = new THREE.BoxGeometry(3, 0.6, 1.6);
    const carMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x3388ff,
      roughness: 0.5,
      metalness: 0.5
    });
    this.carMesh = new THREE.Mesh(carGeometry, carMaterial);
    this.carMesh.castShadow = true;
    this.carMesh.receiveShadow = true;
    this.scene.add(this.carMesh);
    
    // Adjust cabin to match X axis forward orientation
    const cabinGeometry = new THREE.BoxGeometry(1.5, 0.5, 1.4);
    const cabinMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x334455,
      roughness: 0.1,
      metalness: 0.9
    });
    const cabin = new THREE.Mesh(cabinGeometry, cabinMaterial);
    cabin.position.set(0.2, 0.55, 0); // X is forward
    cabin.castShadow = true;
    this.carMesh.add(cabin);
    
    // Modify wheel creation with correct orientation
    const wheelPositions = [
      new THREE.Vector3(-1, -0.5, 0.8),  // Back left
      new THREE.Vector3(-1, -0.5, -0.8), // Back right  
      new THREE.Vector3(1, -0.5, 0.8),   // Front left
      new THREE.Vector3(1, -0.5, -0.8),  // Front right
    ];
    
    for (let i = 0; i < 4; i++) {
      const wheelGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16);
      // Change rotation to align with Z axis (car width)
      wheelGeometry.rotateX(Math.PI / 2);
      
      const wheelMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x222222,
        roughness: 0.8,
        metalness: 0.5
      });
      const wheelMesh = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheelMesh.position.copy(wheelPositions[i]);
      wheelMesh.castShadow = true;

      if (this.isRemote) {
        this.carMesh.add(wheelMesh);
      } else {
        this.scene.add(wheelMesh);
      }

      this.wheelMeshes.push(wheelMesh);
    }
    
    // Place headlights at the front (positive X)
    const headlightGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.1, 16);
    headlightGeometry.rotateZ(Math.PI / 2); // Align with X axis
    
    const headlightMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xffffaa,
      emissive: 0xffff88,
      emissiveIntensity: 1.5,
      opacity: 0.8,
      transparent: true
    });
    
    // Adjust headlight positions to front of car (positive X)
    const leftHeadlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
    leftHeadlight.position.set(1.5, 0.3, 0.6);
    leftHeadlight.name = 'leftHeadlight';
    this.carMesh.add(leftHeadlight);
    
    const rightHeadlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
    rightHeadlight.position.set(1.5, 0.3, -0.6);
    rightHeadlight.name = 'rightHeadlight';
    this.carMesh.add(rightHeadlight);
    
    // Adjust headlight point lights to match
    const leftPointLight = new THREE.PointLight(0xffffaa, 1, 10);
    leftPointLight.position.copy(leftHeadlight.position);
    this.carMesh.add(leftPointLight);
    
    const rightPointLight = new THREE.PointLight(0xffffaa, 1, 10);
    rightPointLight.position.copy(rightHeadlight.position);
    this.carMesh.add(rightPointLight);
  }
}