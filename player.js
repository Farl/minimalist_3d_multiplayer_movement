import * as THREE from 'three';

export function createPlayerModel(three, username) {
    // Create a car instead of a character
    const carGroup = new THREE.Group();
    
    // Generate consistent color from username
    const hash = username.split('').reduce((a, b) => {
        a = ((a << 5) - a) + b.charCodeAt(0);
        return a & a;
    }, 0);
    const color = new THREE.Color(Math.abs(hash) % 0xffffff);
    
    // Create car body
    const bodyGeometry = new THREE.BoxGeometry(3, 1, 1.6);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.5;
    body.castShadow = true;
    carGroup.add(body);
    
    // Add cabin
    const cabinGeometry = new THREE.BoxGeometry(1.5, 0.8, 1.4);
    const cabinMaterial = new THREE.MeshStandardMaterial({ 
        color: color.clone().multiplyScalar(0.8),
        roughness: 0.1,
        metalness: 0.9
    });
    const cabin = new THREE.Mesh(cabinGeometry, cabinMaterial);
    cabin.position.set(-0.2, 0.9, 0);
    cabin.castShadow = true;
    body.add(cabin);
    
    // Add wheels
    const wheelGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16);
    wheelGeometry.rotateZ(Math.PI / 2);
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x222222 });
    
    // Front left wheel
    const wheelFL = new THREE.Mesh(wheelGeometry, wheelMaterial);
    wheelFL.position.set(-1, -0.3, 0.8);
    wheelFL.castShadow = true;
    carGroup.add(wheelFL);
    wheelFL.name = "wheelFL";
    
    // Front right wheel
    const wheelFR = new THREE.Mesh(wheelGeometry, wheelMaterial);
    wheelFR.position.set(-1, -0.3, -0.8);
    wheelFR.castShadow = true;
    carGroup.add(wheelFR);
    wheelFR.name = "wheelFR";
    
    // Rear left wheel
    const wheelRL = new THREE.Mesh(wheelGeometry, wheelMaterial);
    wheelRL.position.set(1, -0.3, 0.8);
    wheelRL.castShadow = true;
    carGroup.add(wheelRL);
    wheelRL.name = "wheelRL";
    
    // Rear right wheel
    const wheelRR = new THREE.Mesh(wheelGeometry, wheelMaterial);
    wheelRR.position.set(1, -0.3, -0.8);
    wheelRR.castShadow = true;
    carGroup.add(wheelRR);
    wheelRR.name = "wheelRR";
    
    return carGroup;
}