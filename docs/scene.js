/**
 * scene.js — Three.js Scene Manager for Inequality Simulator
 *
 *  -----------------
 * This file owns everything 3D. It is intentionally separate from app.js
 * so simulation logic and rendering logic never get tangled together.
 *
 * The one object app.js needs to know about is SceneManager.
 * app.js creates it, calls update() each simulation step, and calls
 * setCameraMode() when the user switches views. That's it.
 *
 * WHAT'S IN HERE
 * ──────────────
 * 1. SceneManager class
 *    └─ init()             Build the Three.js renderer, scene, lights
 *    └─ loadCharacter()    Load idle.glb mesh + pull clips from all 4 GLBs
 *    └─ playAnimation()    Crossfade between idle / walking / sad / celebrate
 *    └─ setCameraMode()    GSAP tween between 3rd-person and 1st-person cameras
 *    └─ buildCrowd()       Clone agents, place in a ring (first-person view)
 *    └─ updateCrowd()      Drive each crowd member's animation from sim data
 *    └─ update()           Called by app.js each step with { bracket, wealth,
 *                          percentile, crowdData }
 *    └─ animate()          Internal render loop (requestAnimationFrame)
 */

// ─── Constants ──────────────────────────────────────────────────────────────

// How each wealth bracket maps to an animation name
const BRACKET_ANIMATION = {
    Lower:       'sad',
    Middle:      'walking',
    Upper:       'celebrating',
};

// Third-person camera position and where it looks
const CAM_3P = {
    position: { x: 0,    y: 2.0, z: 4.5 },
    target:   { x: 0,    y: 1.0, z: 0   },
};

// First-person camera (sits at the character's eye level, looks forward)
const CAM_1P = {
    position: { x: 0,    y: 1.7, z: 0.1 },
    target:   { x: 0,    y: 1.7, z: -10 },
};

// How many crowd agents to spawn in first-person view
const CROWD_SIZE = 18;

// Radius of the circle the crowd stands on (units = metres in the scene)
const CROWD_RADIUS = 6;

// ─── SceneManager ────────────────────────────────────────────────────────────

class SceneManager {

    /**
     * @param {HTMLCanvasElement} canvas  The <canvas id="scene"> element
     */
    constructor(canvas) {
        this.canvas    = canvas;
        this.cameraMode = 'third';   // 'third' | 'first'
        this.isLoaded   = false;     // true once all 4 GLBs have loaded

        // Three.js objects — populated in init() and loadCharacter()
        this.renderer  = null;
        this.scene     = null;
        this.camera    = null;
        this.camTarget = new THREE.Vector3(...Object.values(CAM_3P.target));

        // Character objects
        this.character = null;   // THREE.Group (the mesh)
        this.mixer     = null;   // THREE.AnimationMixer
        this.clips     = {};     // { idle, walking, sad, celebrating }
        this.actions   = {};     // { idle, walking, sad, celebrating }
        this.currentAction = null;

        // Crowd
        this.crowdGroup   = new THREE.Group();  // parent for all crowd clones
        this.crowdMixers  = [];                 // one mixer per crowd member
        this.crowdActions = [];                 // current action per member
        this.crowdClips   = {};                 // shared clips (same as main)

        // Clock drives animation mixer delta time
        this.clock = new THREE.Clock();

        // How many animation GLBs have finished loading
        this._loadedCount = 0;
        this._totalToLoad = 4;  // idle, walking, sad, celebrating

        // GSAP tween reference (so we can kill it before starting a new one)
        this._camTween = null;
    }

    // ─── 1. INITIALISE SCENE ─────────────────────────────────────────────────

    /**
     * init()
     * --------------------------------------------------------------
     * Creates the WebGL renderer, the scene graph, and the camera.
     * Call this once from app.js after the DOM is ready.
     *
     * THREE.WebGLRenderer renders into our <canvas> element.
     * antialias: true smooths jagged edges.
     */
    init() {
        // ── Renderer ──────────────────────────────────────────────
        this.renderer = new THREE.WebGLRenderer({
            canvas:     this.canvas,
            antialias:  true,
            alpha:      false,
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
        // Correct colour space for GLTF assets
        this.renderer.outputColorSpace   = THREE.SRGBColorSpace;
        this.renderer.toneMapping        = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;

        // ── Scene ─────────────────────────────────────────────────
        this.scene = new THREE.Scene();
        // Dark gradient fog so the crowd fades naturally in first-person
        this.scene.background = new THREE.Color(0x111827);
        this.scene.fog = new THREE.FogExp2(0x111827, 0.04);

        // ── Camera ────────────────────────────────────────────────
        // PerspectiveCamera(fov, aspect, near, far)
        this.camera = new THREE.PerspectiveCamera(
            55,
            this.canvas.clientWidth / this.canvas.clientHeight,
            0.1,
            100
        );
        this._applyCameraPreset(CAM_3P, false); // snap (no tween) on first load

        // ── Lights ────────────────────────────────────────────────
        this._buildLights();

        // ── Floor ─────────────────────────────────────────────────
        this._buildFloor();

        // ── Crowd container ───────────────────────────────────────
        this.scene.add(this.crowdGroup);
        this.crowdGroup.visible = false; // hidden until first-person mode

        // ── Handle canvas resize ──────────────────────────────────
        window.addEventListener('resize', () => this._onResize());

        // ── Start render loop ─────────────────────────────────────
        this.animate();

        console.log('[SceneManager] Scene initialised.');
    }

    /**
     * _buildLights()
     * --------------------------------------------------------------
     * Lights the scene so the character looks good.
     *
     * We use three lights — a common approach in 3D:
     *   Key light   : main directional light (the "sun")
     *   Fill light  : softer light from the opposite side, prevents pure black shadows
     *   Ambient     : low-level global light so nothing is completely dark
     */
    _buildLights() {
        // Ambient — very dim, just lifts shadows slightly
        const ambient = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambient);

        // Key light — strong directional from upper-right front
        const key = new THREE.DirectionalLight(0xffeedd, 2.0);
        key.position.set(3, 5, 3);
        key.castShadow = true;
        key.shadow.mapSize.set(1024, 1024);
        key.shadow.camera.near = 0.5;
        key.shadow.camera.far  = 30;
        key.shadow.camera.left = -5;
        key.shadow.camera.right = 5;
        key.shadow.camera.top  = 5;
        key.shadow.camera.bottom = -5;
        this.scene.add(key);
        this.keyLight = key;  // stored so we can tint it by wealth bracket later

        // Fill light — cooler tone from the left
        const fill = new THREE.DirectionalLight(0xaaccff, 0.6);
        fill.position.set(-3, 3, -2);
        this.scene.add(fill);

        // Rim light — behind the character, creates a subtle outline
        const rim = new THREE.DirectionalLight(0xffffff, 0.3);
        rim.position.set(0, 2, -5);
        this.scene.add(rim);
    }

    /**
     * _buildFloor()
     * --------------------------------------------------------------
     * A simple circular ground plane so the character doesn't float.
     * PlaneGeometry is flat; we rotate it 90° to lie horizontal.
     */
    _buildFloor() {
        const geo = new THREE.CircleGeometry(12, 64);
        const mat = new THREE.MeshStandardMaterial({
            color:     0x1a2332,
            roughness: 0.9,
            metalness: 0.1,
        });
        const floor = new THREE.Mesh(geo, mat);
        floor.rotation.x = -Math.PI / 2; // rotate flat
        floor.receiveShadow = true;
        this.scene.add(floor);
    }

    // ─── 2. LOAD CHARACTER ───────────────────────────────────────────────────

    /**
     * loadCharacter()
     * --------------------------------------------------------------
     * Loads the 4 Mixamo GLB files. Because each "with skin" file contains
     * the full character mesh AND one animation, we:
     *   1. Use idle.glb for the MESH — add it to the scene, create the mixer
     *   2. Pull only the animation CLIP from the other 3 files
     *
     * All Mixamo characters share the same bone naming convention
     * ("mixamorigHips", "mixamorigSpine", etc.), so clips from any
     * Mixamo animation file can be used with any Mixamo character mesh.
     *
     * @param {Function} onReady  Called once all 4 clips are loaded
     */
    loadCharacter(onReady) {
        this._onReadyCallback = onReady;
        const loader = new THREE.GLTFLoader();

        // ── Load the base mesh from idle.glb ──────────────────────
        loader.load(
            'assets/idle.glb',
            (gltf) => {
                const model = gltf.scene;

                // Scale: Mixamo exports at cm scale → divide by 100
                model.scale.setScalar(0.01);

                // Cast AND receive shadows for every mesh inside the model
                model.traverse((node) => {
                    if (node.isMesh) {
                        node.castShadow    = true;
                        node.receiveShadow = true;
                        // Fix Mixamo colour encoding
                        if (node.material.map) {
                            node.material.map.colorSpace = THREE.SRGBColorSpace;
                        }
                    }
                });

                this.character = model;
                this.scene.add(this.character);

                // Create the AnimationMixer — one per character
                // The mixer plays clips on this model's skeleton
                this.mixer = new THREE.AnimationMixer(this.character);

                // Store idle clip and create its action
                this.clips.idle  = gltf.animations[0];
                this.actions.idle = this.mixer.clipAction(this.clips.idle);

                this._checkAllLoaded();
            },
            undefined,
            (err) => console.error('[SceneManager] Failed to load idle.glb', err)
        );

        // ── Load animation-only clips from the other 3 files ──────
        // We don't add their meshes to the scene — we just take the clip.
        const animsToLoad = [
            { file: 'assets/walking.glb',    name: 'walking'     },
            { file: 'assets/sad_idle.glb',   name: 'sad'         },
            { file: 'assets/celebrating.glb', name: 'celebrating' },
        ];

        animsToLoad.forEach(({ file, name }) => {
            loader.load(
                file,
                (gltf) => {
                    // Keep the clip; discard the duplicate mesh
                    this.clips[name] = gltf.animations[0];
                    // clipAction() binds this clip to our character's skeleton
                    this.actions[name] = this.mixer.clipAction(this.clips[name]);
                    this._checkAllLoaded();
                },
                undefined,
                (err) => console.error(`[SceneManager] Failed to load ${file}`, err)
            );
        });
    }

    /**
     * _checkAllLoaded()
     * --------------------------------------------------------------
     * Increments a counter. Once all 4 GLBs are loaded, starts the
     * idle animation and calls the onReady callback so app.js knows
     * the scene is ready for data.
     */
    _checkAllLoaded() {
        this._loadedCount++;
        if (this._loadedCount < this._totalToLoad) return;

        console.log('[SceneManager] All animations loaded.');
        this.isLoaded = true;

        // Start in idle
        this.actions.idle.play();
        this.currentAction = this.actions.idle;

        // Build crowd meshes now that we have the character to clone
        this._buildCrowd();

        if (this._onReadyCallback) this._onReadyCallback();
    }

    // ─── 3. ANIMATION STATE MACHINE ──────────────────────────────────────────

    /**
     * playAnimation(name, fadeDuration)
     * --------------------------------------------------------------
     * Crossfades from whatever is currently playing to the new clip.
     *
     * CrossFadeTo() blends TWO clips simultaneously over `fadeDuration`
     * seconds — it sounds fancy but is just a weight lerp under the hood.
     *
     * @param {string} name           'idle' | 'walking' | 'sad' | 'celebrating'
     * @param {number} fadeDuration   Seconds for the blend (default 0.5s)
     */
    playAnimation(name, fadeDuration = 0.5) {
        const nextAction = this.actions[name];
        if (!nextAction || this.currentAction === nextAction) return;

        nextAction.reset().play();
        this.currentAction.crossFadeTo(nextAction, fadeDuration, false);
        this.currentAction = nextAction;
    }

    // ─── 4. CAMERA MODES ─────────────────────────────────────────────────────

    /**
     * setCameraMode(mode)
     * --------------------------------------------------------------
     * Smoothly tweens the camera between third-person and first-person.
     *
     * GSAP tweens THREE.js Vector3 objects directly — GSAP doesn't care
     * what it's animating, as long as the keys are numeric properties.
     *
     * Third-person : camera hovers behind and above the character
     * First-person : camera sits at eye level, crowd becomes visible
     *
     * @param {'third'|'first'} mode
     */
    setCameraMode(mode) {
        if (this.cameraMode === mode) return;
        this.cameraMode = mode;

        // Kill any in-progress camera tween first
        if (this._camTween) {
            this._camTween.kill();
        }

        const preset = mode === 'first' ? CAM_1P : CAM_3P;
        this._applyCameraPreset(preset, true); // true = use GSAP tween

        // Show/hide crowd
        this.crowdGroup.visible = (mode === 'first');

        // In first-person, hide the main character mesh (you can't see yourself)
        if (this.character) {
            this.character.visible = (mode === 'third');
        }
    }

    /**
     * _applyCameraPreset(preset, animate)
     * --------------------------------------------------------------
     * Either snaps or tweens camera position + target to a preset.
     *
     * @param {{ position, target }} preset
     * @param {boolean} animate   false = instant snap (used on init)
     */
    _applyCameraPreset(preset, animate) {
        if (!animate) {
            this.camera.position.set(
                preset.position.x,
                preset.position.y,
                preset.position.z
            );
            this.camTarget.set(
                preset.target.x,
                preset.target.y,
                preset.target.z
            );
            this.camera.lookAt(this.camTarget);
            return;
        }

        // GSAP tween the camera's position object
        this._camTween = gsap.timeline()
            .to(this.camera.position, {
                x: preset.position.x,
                y: preset.position.y,
                z: preset.position.z,
                duration: 1.2,
                ease: 'power2.inOut',
            })
            .to(this.camTarget, {          // simultaneously tween the look-at target
                x: preset.target.x,
                y: preset.target.y,
                z: preset.target.z,
                duration: 1.2,
                ease: 'power2.inOut',
            }, '<');                       // '<' means start at same time as previous tween
    }

    // ─── 5. CROWD SYSTEM ─────────────────────────────────────────────────────

    /**
     * _buildCrowd()
     * --------------------------------------------------------------
     * Clones the main character CROWD_SIZE times and places them
     * evenly around a circle.
     *
     * Each clone gets its own AnimationMixer and starts playing idle.
     * The crowd is parented to crowdGroup so we can show/hide it as one unit.
     *
     * THREE.SkeletonUtils.clone() does a proper deep clone of a skinned
     * mesh (normal .clone() doesn't correctly copy bone bindings).
     */
    _buildCrowd() {
        if (!this.character) return;

        // Clear any previous crowd
        while (this.crowdGroup.children.length > 0) {
            this.crowdGroup.remove(this.crowdGroup.children[0]);
        }
        this.crowdMixers  = [];
        this.crowdActions = [];

        for (let i = 0; i < CROWD_SIZE; i++) {
            // Angle around the circle for this agent
            const angle    = (i / CROWD_SIZE) * Math.PI * 2;
            // Vary the radius slightly so it doesn't look like a perfect ring
            const radius   = CROWD_RADIUS + (Math.random() * 1.5 - 0.75);

            // Clone the character (skeleton-aware clone)
            const clone = THREE.SkeletonUtils.clone(this.character);

            // Position on the circle
            clone.position.set(
                Math.sin(angle) * radius,
                0,
                Math.cos(angle) * radius
            );

            // Rotate to face the centre (where the camera is in 1st-person)
            clone.rotation.y = angle + Math.PI;

            // Slight random scale variation for visual interest
            const s = 0.009 + Math.random() * 0.002;
            clone.scale.setScalar(s);

            // Each clone needs its own mixer
            const mixer = new THREE.AnimationMixer(clone);

            // Default: play idle
            const action = mixer.clipAction(this.clips.idle);
            action.play();

            this.crowdGroup.add(clone);
            this.crowdMixers.push(mixer);
            this.crowdActions.push({ current: action, mixer });
        }

        console.log(`[SceneManager] Crowd of ${CROWD_SIZE} built.`);
    }

    /**
     * updateCrowd(crowdData)
     * --------------------------------------------------------------
     * Receives an array of bracket strings from app.js, one per crowd
     * member, and crossfades each clone to the matching animation.
     *
     * We only update a random subset each call to avoid all agents
     * changing at exactly the same time (looks more organic).
     *
     * @param {string[]} brackets   e.g. ['Upper','Middle','Lower', ...]
     */
    updateCrowd(brackets) {
        if (!brackets || !brackets.length) return;

        brackets.forEach((bracket, i) => {
            if (i >= CROWD_SIZE) return;
            const animName  = BRACKET_ANIMATION[bracket] || 'idle';
            const nextClip  = this.clips[animName];
            if (!nextClip) return;

            const mixerObj  = this.crowdActions[i];
            const nextAction = mixerObj.mixer.clipAction(nextClip);

            if (mixerObj.current === nextAction) return;

            nextAction.reset().play();
            mixerObj.current.crossFadeTo(nextAction, 0.8, false);
            mixerObj.current = nextAction;
        });
    }

    // ─── 6. UPDATE (called by app.js each simulation step) ───────────────────

    /**
     * update(data)
     * --------------------------------------------------------------
     * The single entry point app.js calls every time the simulation steps.
     *
     * @param {object} data
     * @param {string}   data.bracket     'Lower' | 'Middle' | 'Upper'
     * @param {number}   data.wealth      Current wealth value
     * @param {number}   data.percentile  0–100, where "You" sits in the population
     * @param {string[]} data.crowdBrackets  Array of brackets for crowd agents
     */
    update({ bracket, wealth, percentile, crowdBrackets } = {}) {
        if (!this.isLoaded) return;

        // ── Drive main character animation ────────────────────────
        const animName = BRACKET_ANIMATION[bracket] || 'idle';
        this.playAnimation(animName);

        // ── Tint the key light by bracket ─────────────────────────
        // Upper = warm golden light, Middle = neutral, Lower = cold blue
        const lightTints = {
            Upper:  0xffd580,   // warm gold
            Middle: 0xffffff,   // neutral white
            Lower:  0x8899cc,   // cold blue-grey
        };
        if (this.keyLight && lightTints[bracket]) {
            gsap.to(this.keyLight.color, {
                r: new THREE.Color(lightTints[bracket]).r,
                g: new THREE.Color(lightTints[bracket]).g,
                b: new THREE.Color(lightTints[bracket]).b,
                duration: 1.5,
                ease: 'power1.inOut',
            });
        }

        // ── Update crowd animations ────────────────────────────────
        if (this.cameraMode === 'first' && crowdBrackets) {
            this.updateCrowd(crowdBrackets);
        }
    }

    // ─── 7. RENDER LOOP ──────────────────────────────────────────────────────

    /**
     * animate()
     * --------------------------------------------------------------
     * The render loop. requestAnimationFrame tells the browser to call
     * this function before the next repaint — typically 60 times/second.
     *
     * delta is the time since the last frame (seconds). Passing it to
     * mixer.update() keeps animations frame-rate independent.
     */
    animate() {
        requestAnimationFrame(() => this.animate());

        const delta = this.clock.getDelta();

        // Advance character animations
        if (this.mixer) this.mixer.update(delta);

        // Advance all crowd animations
        this.crowdMixers.forEach(m => m.update(delta));

        // Keep camera looking at the target (GSAP tweens camTarget each frame)
        this.camera.lookAt(this.camTarget);

        this.renderer.render(this.scene, this.camera);
    }

    // ─── 8. HELPERS ──────────────────────────────────────────────────────────

    /**
     * _onResize()
     * Updates the renderer and camera aspect ratio when the window resizes.
     * Without this the scene would stretch or squash.
     */
    _onResize() {
        const w = this.canvas.clientWidth;
        const h = this.canvas.clientHeight;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    }

    /**
     * dispose()
     * Clean up GPU resources if the scene is ever torn down.
     * Good practice so memory doesn't leak on SPA-style navigation.
     */
    dispose() {
        this.renderer.dispose();
        console.log('[SceneManager] Disposed.');
    }
}
