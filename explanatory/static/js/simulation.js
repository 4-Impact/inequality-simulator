import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'; 

// --- Configuration ---
const AGENT_COUNT = 5;
const STARTING_WEALTH = 10.00;
const MEAN_W = 0.2;
const SIGMA_W = 0.05;

// REVERTED: Point to .glb files
const MODEL_PATHS = [
    '/static/assets/person1.glb',
    '/static/assets/person2.glb'
];

// --- Scene Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x222222);
scene.fog = new THREE.Fog(0x222222, 10, 50);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 14);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1, 0);

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(5, 10, 7);
dirLight.castShadow = true;
scene.add(dirLight);

const floorGeo = new THREE.PlaneGeometry(20, 20);
const floorMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// --- Helpers ---
function randomGaussian(mean, stdev) {
    const u = 1 - Math.random();
    const v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return z * stdev + mean;
}

function createTextSprite(message, color = 'white', fontSize = 60) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 128;
    ctx.font = `Bold ${fontSize}px Arial`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 4;
    ctx.strokeText(message, 128, 64);
    ctx.fillText(message, 128, 64);
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(2, 1, 1);
    return sprite;
}

// REVERTED: Use GLTFLoader
const loader = new GLTFLoader();

// --- Agent Class ---
class Agent {
    constructor(id, x, z, typeIndex) {
        this.id = id;
        this.wealth = STARTING_WEALTH;
        this.W = randomGaussian(MEAN_W, SIGMA_W);
        
        // Setup Placeholder Group
        this.mesh = new THREE.Group();
        this.mesh.position.set(x, 0, z);
        this.mesh.lookAt(0, 0, 0);
        scene.add(this.mesh);

        const modelPath = MODEL_PATHS[typeIndex % MODEL_PATHS.length];
        
        loader.load(modelPath, (gltf) => {
            // GLTF SPECIFIC: The model is inside 'gltf.scene'
            const model = gltf.scene;

            model.scale.set(1.5, 1.5, 1.5); 
            
            model.traverse((node) => {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                }
            });
            
            this.mesh.add(model);
        }, undefined, (error) => {
            console.error(`Error loading ${modelPath}:`, error);
        });

        // Wealth Label
        this.labelSprite = createTextSprite(this.wealth.toFixed(2));
        this.labelSprite.position.set(0, 3.0, 0); 
        this.mesh.add(this.labelSprite);
    }

    updateLabel() {
        this.mesh.remove(this.labelSprite);
        const color = this.wealth >= 10 ? '#4caf50' : '#ff5252';
        this.labelSprite = createTextSprite(this.wealth.toFixed(2), color);
        this.labelSprite.position.set(0, 3.0, 0);
        this.mesh.add(this.labelSprite);
    }
}

// --- Initialization ---
const agents = [];
const radius = 4;

for (let i = 0; i < AGENT_COUNT; i++) {
    const angle = (i / (AGENT_COUNT - 1)) * Math.PI - Math.PI / 2;
    const x = Math.sin(angle) * radius * 1.5;
    const z = Math.cos(angle) * radius * 0.5;
    
    // Alternating types: 0, 1, 0, 1...
    const typeIndex = i % 2; 
    agents.push(new Agent(i, x, z - 2, typeIndex));
}

// --- Animation Helpers ---
function animateTransfer(fromAgent, toAgent, amount, color, duration = 1000) {
    return new Promise(resolve => {
        const geo = new THREE.SphereGeometry(0.15, 16, 16);
        const mat = new THREE.MeshBasicMaterial({ color: color });
        const orb = new THREE.Mesh(geo, mat);
        
        const startPos = fromAgent.mesh.position.clone().add(new THREE.Vector3(0, 2, 0));
        const endPos = toAgent.mesh.position.clone().add(new THREE.Vector3(0, 2, 0));
        
        orb.position.copy(startPos);
        scene.add(orb);

        const textSprite = createTextSprite(amount.toFixed(2), color, 40);
        textSprite.scale.set(1, 0.5, 1);
        orb.add(textSprite);

        let startTime = null;
        function loop(time) {
            if (!startTime) startTime = time;
            const progress = (time - startTime) / duration;

            if (progress < 1) {
                const currentPos = new THREE.Vector3().lerpVectors(startPos, endPos, progress);
                currentPos.y += Math.sin(progress * Math.PI) * 1.5;
                orb.position.copy(currentPos);
                requestAnimationFrame(loop);
            } else {
                scene.remove(orb);
                resolve();
            }
        }
        requestAnimationFrame(loop);
    });
}

function animateFloatingText(agent, text, color, duration = 1000) {
    return new Promise(resolve => {
        const sprite = createTextSprite(text, color, 40);
        sprite.position.copy(agent.mesh.position).add(new THREE.Vector3(0, 2.5, 0));
        scene.add(sprite);

        let startTime = null;
        function loop(time) {
            if (!startTime) startTime = time;
            const progress = (time - startTime) / duration;
            if (progress < 1) {
                sprite.position.y += 0.02;
                sprite.material.opacity = 1 - progress;
                requestAnimationFrame(loop);
            } else {
                scene.remove(sprite);
                resolve();
            }
        }
        requestAnimationFrame(loop);
    });
}

// --- Main Logic (Econophysics) ---
async function runSimulation() {
    const stepInfo = document.getElementById('step-info');

    // Wait 1 second for GLB models (usually faster than FBX)
    await new Promise(r => setTimeout(r, 1000));

    for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        
        const originalScale = agent.mesh.scale.clone();
        agent.mesh.scale.multiplyScalar(1.2);

        // 1. Payday
        const income = agent.wealth * agent.W;
        agent.wealth += income;
        agent.updateLabel();
        stepInfo.innerHTML = `Agent ${i + 1}: Payday (+${income.toFixed(2)})`;
        await animateFloatingText(agent, `+${income.toFixed(2)}`, '#4caf50', 1000);

        // 2. Survival Cost
        const allWealths = agents.map(a => a.wealth);
        const expScale = allWealths.reduce((a, b) => a + b, 0) / allWealths.length;
        let survivalCost = 0;
        if (expScale > 1) {
            survivalCost = -expScale * Math.log(1 - 0.1);
        }

        stepInfo.innerHTML = `Agent ${i + 1}: Paying Survival Cost`;
        
        let survivalTargetIdx;
        do { survivalTargetIdx = Math.floor(Math.random() * AGENT_COUNT); } 
        while (survivalTargetIdx === i);
        const survivalTarget = agents[survivalTargetIdx];

        let actualPay = 0;
        if (agent.wealth > survivalCost) {
            agent.wealth -= survivalCost;
            survivalTarget.wealth += survivalCost;
            actualPay = survivalCost;
        } else {
            actualPay = agent.wealth;
            survivalTarget.wealth += actualPay;
            agent.wealth = 1; 
        }

        await animateTransfer(agent, survivalTarget, actualPay, '#ff5252', 1500);
        agent.updateLabel();
        survivalTarget.updateLabel();

        // 3. Thrive Cost
        stepInfo.innerHTML = `Agent ${i + 1}: Checking Thrive Exchange...`;
        
        let thriveTargetIdx;
        do { thriveTargetIdx = Math.floor(Math.random() * AGENT_COUNT); } 
        while (thriveTargetIdx === i);
        const thriveTarget = agents[thriveTargetIdx];

        const thriveCost = thriveTarget.W * agent.wealth;

        if (agent.wealth > thriveCost) {
            stepInfo.innerHTML = `Agent ${i + 1}: Buying Goods (${thriveCost.toFixed(2)})`;
            thriveTarget.wealth += thriveCost;
            agent.wealth -= thriveCost;
            await animateTransfer(agent, thriveTarget, thriveCost, '#3498db', 1500);
            agent.updateLabel();
            thriveTarget.updateLabel();
        } else {
            stepInfo.innerHTML = `Agent ${i + 1}: Can't afford Thrive Cost`;
            await new Promise(r => setTimeout(r, 1000));
        }

        agent.mesh.scale.copy(originalScale);
        await new Promise(r => setTimeout(r, 500));
    }
    stepInfo.innerHTML = "Round Complete";
}

runSimulation();

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});