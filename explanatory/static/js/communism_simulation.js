import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'; 

// --- Configuration ---
const AGENT_COUNT = 4;
const STARTING_WEALTH = 10.00;
const MEAN_W = 0.2;
const SIGMA_W = 0.05;

const MODEL_SCALE = 0.05; 
const BALL_SCALE = 20.0; 

// --- Scene Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x222222);
scene.fog = new THREE.Fog(0x222222, 20, 100);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 12, 35); 

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 2, 0);

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(10, 20, 10);
dirLight.castShadow = true;
scene.add(dirLight);

const floorGeo = new THREE.PlaneGeometry(60, 60);
const floorMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// --- Helpers ---
const clock = new THREE.Clock();
const loader = new FBXLoader();

let crystalBallModel = null;

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
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(3, 1.5, 1);
    return sprite;
}

function loadFBX(path) {
    return new Promise((resolve, reject) => {
        loader.load(path, (obj) => resolve(obj), undefined, (err) => reject(err));
    });
}

function loadAnimationClip(path) {
    return new Promise((resolve) => {
        loader.load(path, (object) => {
            if (object.animations && object.animations.length > 0) {
                resolve(object.animations[0]); 
            } else {
                resolve(null);
            }
        }, undefined, () => resolve(null));
    });
}

function findHandBone(object) {
    let foundBone = null;
    object.traverse((node) => {
        if (node.isBone && !foundBone) {
            const name = node.name.toLowerCase();
            if (name.includes('right') && name.includes('hand')) {
                foundBone = node;
            }
        }
    });
    return foundBone;
}

// --- Agent Class ---
class Agent {
    constructor(id, x, z, typeIndex) {
        this.id = id;
        this.typeIndex = typeIndex;
        this.wealth = STARTING_WEALTH;
        this.W = randomGaussian(MEAN_W, SIGMA_W);
        this.mixer = null;
        this.actions = {};       
        this.activeAction = null;
        this.rightHandBone = null;
        
        this.mesh = new THREE.Group();
        this.mesh.position.set(x, 0, z);
        this.mesh.lookAt(0, 0, 0); 
        scene.add(this.mesh);
    }

    async load() {
        const charName = this.typeIndex === 0 ? 'person1' : 'person2';
        const basePath  = `/static/assets/${charName}-idle.fbx`;
        const throwPath = `/static/assets/${charName}-throwing.fbx`;
        const catchPath = `/static/assets/${charName}-catching.fbx`;
        
        try {
            const model = await loadFBX(basePath);
            model.scale.set(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);
            
            model.traverse((node) => {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                }
            });
            
            this.rightHandBone = findHandBone(model);
            if (!this.rightHandBone) console.warn(`Agent ${this.id}: Right Hand Bone NOT found!`);

            this.mesh.add(model);
            
            this.mixer = new THREE.AnimationMixer(model);
            
            if (model.animations.length > 0) {
                const idle = this.mixer.clipAction(model.animations[0]);
                idle.play();
                this.actions['idle'] = idle;
                this.activeAction = idle;
            }

            const throwClip = await loadAnimationClip(throwPath);
            if (throwClip) {
                const act = this.mixer.clipAction(throwClip);
                act.setLoop(THREE.LoopOnce);
                act.clampWhenFinished = true;
                this.actions['throw'] = act;
            }

            const catchClip = await loadAnimationClip(catchPath);
            if (catchClip) {
                const act = this.mixer.clipAction(catchClip);
                act.setLoop(THREE.LoopOnce);
                act.clampWhenFinished = true;
                this.actions['catch'] = act;
            }

            this.updateLabel();

        } catch (error) {
            console.error(`Error loading agent ${this.id}:`, error);
        }
    }

    update(delta) {
        if (this.mixer) this.mixer.update(delta);
    }

    updateLabel() {
        if (this.labelSprite) this.mesh.remove(this.labelSprite);
        const color = this.wealth >= 10 ? '#4caf50' : '#ff5252';
        this.labelSprite = createTextSprite(this.wealth.toFixed(2), color);
        this.labelSprite.position.set(0, 6.0, 0);
        this.mesh.add(this.labelSprite);
    }

    lookAt(targetPos) {
        this.mesh.lookAt(targetPos.x, 0, targetPos.z);
    }

    playAction(name) {
        if (!this.actions[name]) return;
        const newAction = this.actions[name];
        const oldAction = this.activeAction;

        if (newAction === oldAction) {
            newAction.reset();
            newAction.play();
            return;
        }

        newAction.reset();
        newAction.setEffectiveTimeScale(1);
        newAction.setEffectiveWeight(1);
        newAction.play();

        if (oldAction) oldAction.crossFadeTo(newAction, 0.2); 

        this.activeAction = newAction;

        if (name === 'throw' || name === 'catch') {
            const mixer = this.mixer;
            const onFinished = (e) => {
                if (e.action === newAction) {
                    mixer.removeEventListener('finished', onFinished);
                    this.playAction('idle');
                }
            };
            mixer.addEventListener('finished', onFinished);
        }
    }

    playThrow() { this.playAction('throw'); }
    playCatch() { this.playAction('catch'); }
}

// --- Initialization ---
const agents = [];

const positions = [
    { x: -10, z: -5 }, 
    { x: -10, z: 5 },  
    { x: 10, z: -5 },  
    { x: 10, z: 5 }    
];

for (let i = 0; i < AGENT_COUNT; i++) {
    const pos = positions[i];
    const typeIndex = i % 2; 
    agents.push(new Agent(i, pos.x, pos.z, typeIndex));
}

// --- Animation Functions ---
function animateTransfer(fromAgent, toAgent, amount, color, duration = 1200) {
    fromAgent.lookAt(toAgent.mesh.position);
    toAgent.lookAt(fromAgent.mesh.position);

    fromAgent.playThrow(); 
    setTimeout(() => { toAgent.playCatch(); }, duration * 0.4); 

    return new Promise(resolve => {
        let ball;
        if (crystalBallModel) {
            ball = crystalBallModel.clone();
            ball.scale.set(BALL_SCALE, BALL_SCALE, BALL_SCALE);
        } else {
            const geo = new THREE.SphereGeometry(0.3, 16, 16);
            const mat = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x004444 });
            ball = new THREE.Mesh(geo, mat);
        }

        const textSprite = createTextSprite(amount.toFixed(2), color, 40);
        textSprite.scale.set(2.5, 1.25, 1); 
        textSprite.position.set(0, 1.2, 0); 
        ball.add(textSprite);

        if (fromAgent.rightHandBone) {
            fromAgent.rightHandBone.add(ball);
            ball.position.set(0, 0, 0); 
        } else {
            fromAgent.mesh.add(ball);
            ball.position.set(0, 1.5, 0.5); 
        }

        const releaseTime = 400; 

        setTimeout(() => {
            scene.attach(ball);
            const startPos = ball.position.clone();
            
            let startTime = null;
            function flyLoop(time) {
                if (!startTime) startTime = time;
                const flightDuration = duration - releaseTime;
                const progress = (time - startTime) / flightDuration;

                if (progress < 1) {
                    const currentTarget = new THREE.Vector3();
                    if (toAgent.rightHandBone) {
                        toAgent.rightHandBone.getWorldPosition(currentTarget);
                    } else {
                        currentTarget.copy(toAgent.mesh.position).add(new THREE.Vector3(0, 1.5, 0));
                    }

                    const currentPos = new THREE.Vector3().lerpVectors(startPos, currentTarget, progress);
                    currentPos.y += Math.sin(progress * Math.PI) * 3.0;
                    
                    ball.position.copy(currentPos);
                    requestAnimationFrame(flyLoop);
                } else {
                    if (toAgent.rightHandBone) {
                        toAgent.rightHandBone.add(ball);
                        ball.position.set(0,0,0);
                    } else {
                        scene.remove(ball);
                    }

                    setTimeout(() => {
                        if (ball.parent) ball.parent.remove(ball);
                        resolve();
                    }, 400);
                }
            }
            requestAnimationFrame(flyLoop);

        }, releaseTime);
    });
}

function animateFloatingText(agent, text, color, duration = 1000) {
    return new Promise(resolve => {
        const sprite = createTextSprite(text, color, 40);
        sprite.position.copy(agent.mesh.position).add(new THREE.Vector3(0, 7.0, 0));
        scene.add(sprite);

        let startTime = null;
        function loop(time) {
            if (!startTime) startTime = time;
            const progress = (time - startTime) / duration;
            if (progress < 1) {
                sprite.position.y += 0.03;
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

// --- Main App Logic ---
async function initAndRun() {
    const stepInfo = document.getElementById('step-info');
    stepInfo.innerHTML = "Loading Assets...";

    try {
        try {
            crystalBallModel = await loadFBX('/static/assets/Pouch.fbx');
            crystalBallModel.traverse((node) => {
                if (node.isMesh) {
                    node.material = new THREE.MeshStandardMaterial({
                        //color: 0xa52a2a,
                        //emissive: 0x112244,
                        roughness: 0.1,
                        metalness: 0.8,
                        transparent: true,
                        opacity: 0.9
                    });
                }
            });
        } catch (e) {
            console.warn("Crystal Ball failed to load.");
        }
        
        const loadPromises = agents.map(agent => agent.load());
        await Promise.all(loadPromises);
        
        stepInfo.innerHTML = "Starting Communism Simulation...";
        runSimulation();

    } catch (err) {
        console.error(err);
        stepInfo.innerHTML = "Error loading assets.";
    }
}

async function runSimulation() {
    const stepInfo = document.getElementById('step-info');

    await new Promise(r => setTimeout(r, 1000));

    for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        
        // 1. Payday
        const income = agent.wealth * agent.W;
        agent.wealth += income;
        agent.updateLabel();
        stepInfo.innerHTML = `Agent ${i + 1}: Payday (+${income.toFixed(2)})`;
        await animateFloatingText(agent, `+${income.toFixed(2)}`, '#4caf50', 800);

        // 2. Survival
        const allWealths = agents.map(a => a.wealth);
        const expScale = allWealths.reduce((a, b) => a + b, 0) / allWealths.length;
        let survivalCost = 0;
        if (expScale > 1) survivalCost = -expScale * Math.log(0.9);

        stepInfo.innerHTML = `Agent ${i + 1}: Survival Cost`;
        
        let targetIdx;
        do { targetIdx = Math.floor(Math.random() * AGENT_COUNT); } 
        while (targetIdx === i);
        const target = agents[targetIdx];

        let pay = 0;
        if (agent.wealth > survivalCost) {
            agent.wealth -= survivalCost;
            target.wealth += survivalCost;
            pay = survivalCost;
        } else {
            pay = agent.wealth;
            target.wealth += pay;
            agent.wealth = 1; 
        }

        await animateTransfer(agent, target, pay, '#ff5252', 1500);
        agent.updateLabel();
        target.updateLabel();

        // 3. Thrive
        stepInfo.innerHTML = `Agent ${i + 1}: Thrive Exchange`;
        
        let thriveIdx;
        do { thriveIdx = Math.floor(Math.random() * AGENT_COUNT); } 
        while (thriveIdx === i);
        const thriveTarget = agents[thriveIdx];

        const thriveCost = thriveTarget.W * agent.wealth;

        if (agent.wealth > thriveCost) {
            thriveTarget.wealth += thriveCost;
            agent.wealth -= thriveCost;
            await animateTransfer(agent, thriveTarget, thriveCost, '#3498db', 1500);
            agent.updateLabel();
            thriveTarget.updateLabel();
        } else {
            stepInfo.innerHTML = `Agent ${i + 1}: Skip Thrive`;
            await new Promise(r => setTimeout(r, 500));
        }
        
        // --- STEP 4: INSTANT REDISTRIBUTION (Inside Loop) ---
        stepInfo.innerHTML = "Redistributing Wealth...";
        
        // Calculate Average of CURRENT state
        const totalWealth = agents.reduce((sum, a) => sum + a.wealth, 0);
        const avgWealth = totalWealth / AGENT_COUNT;

        // Apply immediately
        for (let a of agents) {
            const diff = avgWealth - a.wealth;
            a.wealth = avgWealth;
            a.updateLabel();

            // Quick visual flash of change
            if (Math.abs(diff) > 0.05) {
                const color = diff > 0 ? '#4caf50' : '#ff5252';
                const sign = diff > 0 ? '+' : '';
                animateFloatingText(a, `${sign}${diff.toFixed(2)}`, color, 1000);
            }
        }
        
        // Small pause to let the redistribution sink in before next agent starts
        await new Promise(r => setTimeout(r, 1200));
    }

    stepInfo.innerHTML = "Round Complete";
    setTimeout(runSimulation, 1000);
}

initAndRun();

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    agents.forEach(agent => agent.update(delta));
    controls.update();
    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});