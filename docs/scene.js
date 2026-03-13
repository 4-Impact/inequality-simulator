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
    Lower:       'idle',
    Middle:      'idle',
    Upper:       'idle',
};

// Third-person camera — elevated, looking at the cluster centre.
const CAM_3P = {
    position: { x: 0,    y: 6.0, z: -4.0 },
    target:   { x: 0,    y: 0.5, z:  3.0 },
};

// First-person camera (sits at the character's eye level, looks forward)
const CAM_1P = {
    position: { x: 0,    y: 1.7, z: 0.1 },
    target:   { x: 0,    y: 1.7, z: -10 },
};

// How many crowd agents to spawn (matches model population minus "you")
const CROWD_SIZE = 99;

// Radius of the circle the crowd stands on (units = metres in the scene)
const CROWD_RADIUS = 8;

// Distance beyond which crowd members freeze their animation mixer
// (saves CPU — far agents are fogged out anyway)
const CROWD_MIXER_FREEZE_DIST = 25;

// Several small clusters spread in front of the camera.
// Characters are assigned to a cluster once at build time and never move.
// More clusters for the larger population so agents don't pile on top of each other.
const CLUSTERS = [
    { x: -3.0, z:  3.0 },
    { x:  1.5, z:  2.5 },
    { x: -0.8, z:  5.5 },
    { x:  3.2, z:  5.0 },
    { x: -4.5, z:  6.5 },
    { x:  4.8, z:  3.5 },
    { x: -1.5, z:  8.0 },
    { x:  2.0, z:  8.5 },
    { x:  0.0, z: 10.5 },
    { x: -3.5, z: 10.0 },
    { x:  4.0, z:  7.5 },
    { x:  5.5, z:  6.0 },
];
const CLUSTER_INNER_RADIUS = 1.1;  // how tightly members pack within a cluster

// Pool of character meshes for the crowd.
// Index 0 is always "You" (shown in third-person view).
// Add more Mixamo GLBs here to get genuinely different-looking crowd members.
// Workflow: mixamo.com → Characters tab → pick a model → apply idle anim
//           → Download FBX "with skin" → import in Blender → export as GLB
//           (File > Export > glTF 2.0, tick "Include: Selected Objects" and
//            "Data > Mesh > Apply Modifiers", set Format to glTF Binary .glb,
//            tick "Include > Custom Properties" OFF, "Compression" OFF)
const CHAR_POOL = [
    'assets/ben.glb',      // 0
    'assets/leonard.glb',  
    'assets/jody.glb',
    'assets/joe.glb',
    'assets/james.glb',
    `assets/megan.glb`,
    `assets/remy.glb`,
    `assets/suzie.glb`,
    `assets/kate.glb`,
    `assets/louise.glb`,
];

// Display names and emojis shown in the character picker UI.
// Keep this in sync with CHAR_POOL — same order, same length.
const CHAR_META = [
    { name: 'Ben',   emoji: '👱‍♂️' },
    { name: 'Leonard', emoji: '🧔' },
    { name: 'Jody',  emoji: '👩' },
    { name: 'Joe',  emoji: '👱' },
    { name: 'James', emoji: '👨' },
    { name: 'Megan', emoji: '👩' },
    { name: 'Remy', emoji: '🧑' },
    { name: 'Suzie', emoji: '👱🏼‍♀️' },
    { name: 'Kate', emoji: '👩🏻‍🦰' },
    { name: 'Louise', emoji: '🧑🏾‍🦳' },
];

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

        // Pool of loaded character meshes (one per CHAR_POOL entry).
        // Index 0 is this.character; 1+ are alternatives for the crowd.
        this.characterPool = [];
        this.characterIdleClips = [];
        this.currentCharacterIdx = 0;
        this._retargetedClipCache = new Map();
        this._nodeLookupCache = new WeakMap();
        this.clipSourceMeshes = {};
        this._retargetWarnings = new Set();

        // Separate counters for characters and animation clips so that
        // _tryFinalize() waits for BOTH pools to be fully populated.
        // A single shared counter caused a race condition where the 3 fast
        // animation clips could push the total to _totalToLoad before all
        // character GLBs had finished, leaving characterPool with gaps.
        this._charLoadedCount = 0;   // increments per character GLB
        this._animLoadedCount = 0;   // increments per animation clip GLB

        // GSAP tween reference (so we can kill it before starting a new one)
        this._camTween = null;

        // Flying money-particle sprites spawned during exchange events.
        // Managed as a simple pool of plain objects; see _spawnMoneyParticle().
        this._moneyParticles = [];

        // Overlay label system — HTML divs projected from 3D world positions
        this._overlayEl        = null;
        this._playerLabelEl    = null;
        this._richestLabelEl   = null;
        this._poorestLabelEl   = null;
        this._hoverTipEl       = null;

        // Per-step simulation data stored so _updateOverlay() can run each frame
        this._youWealth        = null;
        this._youPctLabel      = null;
        this._crowdWealth      = [];
        this._crowdPctLabel    = [];
        this._richestCrowdSlot = null;
        this._poorestCrowdSlot = null;

        // Raycasting for mouse hover
        this._mouse       = new THREE.Vector2(-999, -999);
        this._raycaster   = new THREE.Raycaster();
        this._hoveredSlot = null; // null = nothing, -1 = player char, 0+ = crowd slot

        // Colored dot sprites floating above each crowd member
        // (red = bottom 33%, yellow = 34-66%, green = 67-100%)
        this._crowdDots = [];   // one THREE.Sprite per crowd member
        this._dotTextures = {}; // cached canvasTexture per colour key
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
        // NOTE: We use window inner dimensions as fallback because the canvas
        // may still report 0×0 if the parent div was just switched from
        // display:none to display:block and the browser hasn't repainted yet.
        const w = this.canvas.clientWidth  || this.canvas.parentElement?.clientWidth  || window.innerWidth;
        const h = this.canvas.clientHeight || this.canvas.parentElement?.clientHeight || window.innerHeight;

        this.renderer = new THREE.WebGLRenderer({
            canvas:     this.canvas,
            antialias:  true,
            alpha:      false,
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(w, h);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
        // Correct colour space for GLTF assets (r134 API: outputEncoding, not outputColorSpace)
        this.renderer.outputEncoding     = THREE.sRGBEncoding;
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
            w / h,
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
        this.crowdGroup.visible = false; // hidden until characters finish loading

        // ── Handle canvas resize ──────────────────────────────────
        window.addEventListener('resize', () => this._onResize());

        // ── Overlay labels (HTML divs projected to world space) ───
        this._initOverlay();

        // ── Mouse hover / raycasting ──────────────────────────────
        this._initMouseHandlers();

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

        // ── Load CHAR_POOL[0] — the "You" character ───────────────
        // This is the only character that gets added to the scene directly
        // and whose idle clip becomes the shared animation source.
        loader.load(
            CHAR_POOL[0],
            (gltf) => {
                const model = gltf.scene;
                this._scaleAndPosition(model, 0);
                this._fixMaterials(model);

                // Keep the template hidden in-scene, but explicitly prepare
                // its world matrices and skinned meshes so clones render
                // correctly without briefly flashing every source model.
                model.visible = false;
                this._prepareCloneSource(model);
                this.characterPool[0] = model;
                this.characterIdleClips[0] = gltf.animations[0] || null;

                // Use the original loaded model directly for the player.
                // Cloning hidden skinned meshes proved unreliable for some
                // assets even when the source GLB itself was valid.
                // Only zero x/z — y was set by _scaleAndPosition to ground the feet.
                // Place player on the ring of the first cluster (not the
                // centre) so they stand among the other cluster members.
                const playerAngle = 0;  // fixed slot on the ring
                model.position.x = CLUSTERS[0].x + Math.cos(playerAngle) * CLUSTER_INNER_RADIUS;
                model.position.z = CLUSTERS[0].z + Math.sin(playerAngle) * CLUSTER_INNER_RADIUS;
                model.visible = (this.cameraMode === 'third');
                this.character = model;
                this.currentCharacterIdx = 0;
                // Face toward the cluster centre
                const pDx = CLUSTERS[0].x - model.position.x;
                const pDz = CLUSTERS[0].z - model.position.z;
                model.rotation.set(0, Math.atan2(pDx, pDz), 0);
                this._captureAnchorTransform(this.character);
                this.character.userData.baseRotY = this.character.userData.anchorRotY ?? model.rotation.y;

                // Mixer and idle clip live on the active player model
                this.mixer        = new THREE.AnimationMixer(this.character);
                this.clips.idle   = this.characterIdleClips[0];
                this.actions.idle = this.mixer.clipAction(this.clips.idle);

                this._charLoadedCount++;
                this._tryFinalize();
            },
            undefined,
            (err) => console.error(`[SceneManager] Failed to load ${CHAR_POOL[0]}`, err)
        );

        // ── Load extra characters ──────────────────────────────────
        // These are added to the scene as visible:false so their skeletons
        // are properly GPU-initialised before SkeletonUtils.clone() is called.
        // A SkinnedMesh that has never been mounted in a scene has unresolved
        // bone references — clones from it render as invisible geometry.
        for (let i = 1; i < CHAR_POOL.length; i++) {
            const idx  = i;
            const path = CHAR_POOL[idx];
            loader.load(
                path,
                (gltf) => {
                    const model = gltf.scene;
                    this._scaleAndPosition(model, idx);
                    this._fixMaterials(model);
                    model.visible = false;          // hidden — only used as clone source
                    this._prepareCloneSource(model);
                    this.characterPool[idx] = model;
                    this.characterIdleClips[idx] = gltf.animations[0] || null;
                    this._charLoadedCount++;
                    this._tryFinalize();
                },
                undefined,
                (err) => console.error(`[SceneManager] Failed to load ${path}`, err)
            );
        }

        // ── Load animation-only clips from the other 3 files ──────
        const animsToLoad = [
            { file: 'assets/walking.glb',     name: 'walking'     },
            { file: 'assets/sad_idle.glb',    name: 'sad'         },
            { file: 'assets/celebrating.glb', name: 'celebrating' },
        ];

        animsToLoad.forEach(({ file, name }) => {
            loader.load(
                file,
                (gltf) => {
                    this.clips[name] = gltf.animations[0];
                    this.clipSourceMeshes[name] = this._findPrimarySkinnedMesh(gltf.scene);
                    this._animLoadedCount++;
                    this._tryFinalize();
                },
                undefined,
                (err) => console.error(`[SceneManager] Failed to load ${file}`, err)
            );
        });
    }

    /**
     * _scaleAndPosition(model)
     * --------------------------------------------------------------
     * Normalizes all imported characters to a consistent world-space height
     * and shifts them so their feet rest on y=0.
     *
     * Some character exports are clearly using different transform scales,
     * so trusting the incoming GLB scale makes giant/tiny characters. We use
     * a guarded Box3 measurement here to bring every model close to the same
     * target height, then allow optional per-character tweaks afterward.
     */
    _scaleAndPosition(model, idx) {
        const TARGET_HEIGHT = 1.72;

        model.updateMatrixWorld(true);

        const initialMetrics = this._measureCharacterMetrics(model);
        const measuredHeight = initialMetrics.height;
        if (Number.isFinite(measuredHeight) && measuredHeight > 0.01) {
            const uniformScale = TARGET_HEIGHT / measuredHeight;
            model.scale.multiplyScalar(uniformScale);
            model.updateMatrixWorld(true);
        }

        const groundedMetrics = this._measureCharacterMetrics(model);
        if (Number.isFinite(groundedMetrics.minY)) {
            model.position.y -= groundedMetrics.minY;
            model.updateMatrixWorld(true);
        }

        // Per-character scale tweaks — only needed if a GLB wasn't exported
        // with matching units and still needs a small nudge.
        // Example: { 6: 0.92 } makes character index 6 eight percent shorter.
        const CHAR_SCALE_OVERRIDES = {
            // 1: 0.95,
        };

        const override = CHAR_SCALE_OVERRIDES[idx];
        if (override) {
            model.scale.multiplyScalar(override);
            model.updateMatrixWorld(true);
            const overrideMetrics = this._measureCharacterMetrics(model);
            if (Number.isFinite(overrideMetrics.minY)) {
                model.position.y -= overrideMetrics.minY;
                model.updateMatrixWorld(true);
            }
        }

        // Store the effective scale of the primary character for crowd maths
        if (!this._characterScale) this._characterScale = model.scale.x;

        const finalMetrics = this._measureCharacterMetrics(model);
        console.log(`[SceneManager] loaded char ${idx} (${CHAR_META[idx]?.name}): measuredHeight=${measuredHeight.toFixed(3)} finalHeight=${finalMetrics.height.toFixed(3)} basis=${finalMetrics.source} scale=(${model.scale.x.toFixed(3)},${model.scale.y.toFixed(3)},${model.scale.z.toFixed(3)}) position.y=${model.position.y.toFixed(4)}`);
    }

    /**
     * _measureCharacterMetrics(object)
     * --------------------------------------------------------------
     * Measures character height using rig bones when available, falling back
     * to world-space bounds otherwise.
     *
     * Bone-based measurement is more reliable for skinned characters because
     * it ignores oversized helper nodes and export-time mesh oddities.
     *
     * @param {THREE.Object3D} object
     * @returns {{ height: number, minY: number, maxY: number, source: string }}
     */
    _measureCharacterMetrics(object) {
        const box = new THREE.Box3().setFromObject(object);
        const boxSize = new THREE.Vector3();
        box.getSize(boxSize);

        let minY = Infinity;
        let maxY = -Infinity;
        let sawFoot = false;
        let sawHead = false;

        object.traverse((node) => {
            if (!node.name) return;

            const normalized = this._normalizeNodeName(node.name);
            if (!normalized) return;

            const pos = new THREE.Vector3();
            node.getWorldPosition(pos);

            if (/headtopend|headend|head|neck/.test(normalized)) {
                maxY = Math.max(maxY, pos.y);
                sawHead = true;
            }

            if (/lefttoeend|righttoeend|lefttoebase|righttoebase|leftfoot|rightfoot/.test(normalized)) {
                minY = Math.min(minY, pos.y);
                sawFoot = true;
            }
        });

        if (sawHead && sawFoot && Number.isFinite(maxY - minY) && (maxY - minY) > 0.2) {
            return {
                height: maxY - minY,
                minY,
                maxY,
                source: 'bones',
            };
        }

        return {
            height: boxSize.y,
            minY: box.min.y,
            maxY: box.max.y,
            source: 'box',
        };
    }

    /**
     * _findRigPoint(object, pattern)
     * --------------------------------------------------------------
     * Returns the world position of the first rig node whose normalized name
     * matches the supplied pattern.
     *
     * @param {THREE.Object3D} object
     * @param {RegExp} pattern
     * @returns {THREE.Vector3|null}
     */
    _findRigPoint(object, pattern) {
        let point = null;

        object?.traverse((node) => {
            if (point || !node.name) return;
            const normalized = this._normalizeNodeName(node.name);
            if (!pattern.test(normalized)) return;

            point = new THREE.Vector3();
            node.getWorldPosition(point);
        });

        return point;
    }

    /**
     * getCharacterPortraitDataUrl(idx, size)
     * --------------------------------------------------------------
     * Renders a one-off headshot of a loaded character for the picker UI.
     * Returns a PNG data URL suitable for an <img> element.
     *
     * @param {number} idx
     * @param {number} size
     * @returns {string|null}
     */
    getCharacterPortraitDataUrl(idx, size = 160) {
        const source = this.characterPool[idx];
        if (!source || typeof THREE === 'undefined') return null;

        const canvas = document.createElement('canvas');
        const px = Math.max(96, size | 0);
        canvas.width = px;
        canvas.height = px;

        const renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: true,
            preserveDrawingBuffer: true,
        });

        try {
            renderer.setPixelRatio(1);
            renderer.setSize(px, px, false);
            renderer.outputEncoding = THREE.sRGBEncoding;
            renderer.setClearColor(0x000000, 0);

            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 20);

            scene.add(new THREE.AmbientLight(0xffffff, 1.1));
            const key = new THREE.DirectionalLight(0xfff1dc, 1.45);
            key.position.set(1.8, 2.2, 2.8);
            scene.add(key);
            const fill = new THREE.DirectionalLight(0xffd7b0, 0.35);
            fill.position.set(-1.1, 1.6, 1.8);
            scene.add(fill);
            const rim = new THREE.DirectionalLight(0xffffff, 0.22);
            rim.position.set(0.2, 1.0, -2.2);
            scene.add(rim);

            const clone = THREE.SkeletonUtils.clone(source);
            this._prepareCloneInstance(clone);
            clone.rotation.y = 0;
            scene.add(clone);

            const idleClip = this.characterIdleClips[idx];
            if (idleClip) {
                const mixer = new THREE.AnimationMixer(clone);
                const action = mixer.clipAction(idleClip);
                action.play();
                mixer.update(0.12);
            }

            clone.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(clone);
            const sizeVec = new THREE.Vector3();
            const center = new THREE.Vector3();
            box.getSize(sizeVec);
            box.getCenter(center);

            const headPos = this._findRigPoint(clone, /headtopend|headend|head/);
            const neckPos = this._findRigPoint(clone, /neck|spine2|spine1|spine/);
            const target = headPos
                ? headPos.clone().lerp(neckPos || center, -0.10)
                : new THREE.Vector3(center.x, box.max.y - sizeVec.y * 0.03, center.z);

            const distance = Math.max(sizeVec.x * 1.08, sizeVec.y * 0.38, 0.68);
            const camY = target.y + Math.max(sizeVec.y * 0.03, 0.04);

            camera.position.set(target.x + sizeVec.x * 0.03, camY, center.z + distance);
            camera.lookAt(target);
            renderer.render(scene, camera);

            return canvas.toDataURL('image/png');
        } catch (error) {
            console.warn(`[SceneManager] Portrait render failed for ${CHAR_META[idx]?.name || `character ${idx}`}:`, error);
            return null;
        } finally {
            renderer.dispose();
            renderer.forceContextLoss?.();
        }
    }

    /**
     * _tryFinalize()
     * --------------------------------------------------------------
     * Called after every GLB load completes (both character meshes and
     * animation clips). Only proceeds once ALL of the following are true:
     *
     *   1. Every character in CHAR_POOL has loaded  (_charLoadedCount)
     *   2. All 3 animation clips have loaded        (_animLoadedCount)
     *   3. this.mixer exists (set by CHAR_POOL[0] callback)
     *
     * Previously a single shared counter was used, which caused a race
     * condition: the 3 fast animation clips could push the total to the
     * threshold before slow character GLBs finished, so _buildCrowd ran
     * with an incomplete characterPool and most crowd members were missing.
     */
    _tryFinalize() {
        if (this._charLoadedCount < CHAR_POOL.length) return;
        if (this._animLoadedCount < 3) return;
        if (!this.mixer) return;  // CHAR_POOL[0] not done yet

        // All characters and animation clips are ready.
        // Pre-warm retargeted clips for EVERY character now, while the mixer is
        // idle and all bones are in T-pose.  Doing this lazily on first playAnimation
        // call used to fire while the idle clip was mid-frame, making the reference
        // pose wrong and causing visible joint deformation on model initialisation.
        const animNames = ['idle', 'walking', 'sad', 'celebrating'];
        for (let ci = 0; ci < this.characterPool.length; ci++) {
            const charObj = this.characterPool[ci];
            if (!charObj) continue;
            animNames.forEach((name) => {
                this._getClipForCharacter(ci, name, charObj);  // builds+caches the retargeted clip
            });
        }

        // Bind clipAction for every clip to the primary character's mixer.
        animNames.forEach((name) => {
            const action = this._getActionForMixer(this.mixer, 0, name, this.character);
            if (action) {
                this.actions[name] = action;
            }
        });

        console.log(`[SceneManager] All loaded: ${CHAR_POOL.length} characters + 3 anim clips.`);
        this.isLoaded = true;

        // Start in idle
        this.actions.idle.play();
        this.currentAction    = this.actions.idle;
        this._currentAnimName = 'idle';

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
        if (!this.actions[name]) {
            if (this.mixer) {
                const action = this._getActionForMixer(
                    this.mixer,
                    this.currentCharacterIdx,
                    name,
                    this.character
                );
                if (action) {
                    this.actions[name] = action;
                }
            }
        }

        const nextAction = this.actions[name];
        if (!nextAction || this.currentAction === nextAction) return;

        nextAction.reset().play();
        this.currentAction.crossFadeTo(nextAction, fadeDuration, false);
        this.currentAction     = nextAction;
        this._currentAnimName  = name;   // remember for setPlayerCharacter
    }

    // ─── 3b. CHARACTER SWITCHER ─────────────────────────────────────────────────

    /**
     * setPlayerCharacter(idx)
     * --------------------------------------------------------------
     * Swaps the player’s visible mesh for a different pooled character.
     * Works at any time — even mid-animation.
     *
     * Because all Mixamo characters share identical bone names, the
     * existing animation clips retarget onto the new mesh automatically
     * via AnimationMixer’s bone-name lookup.
     *
     * @param {number} idx  Index into CHAR_POOL / characterPool
     */
    setPlayerCharacter(idx) {
        if (!this.isLoaded) return;
        if (idx < 0 || idx >= this.characterPool.length) return;

        // If a prior player mesh was a detached clone from an older build,
        // remove it before switching to the pooled scene models.
        if (this.character && !this.characterPool.includes(this.character)) {
            this.scene.remove(this.character);
        }

        // Use the chosen pooled source directly. This keeps the exact GLB
        // that loaded successfully in the debug viewer, instead of relying on
        // a clone path that can fail for some skinned meshes.
        const source  = this.characterPool[idx];
        if (!source) return;
        this.characterPool.forEach((model, modelIdx) => {
            if (model) model.visible = (modelIdx === idx && this.cameraMode === 'third');
        });

        // Place at the player's cluster ring position.
        const playerAngle = 0;
        source.position.x = CLUSTERS[0].x + Math.cos(playerAngle) * CLUSTER_INNER_RADIUS;
        source.position.z = CLUSTERS[0].z + Math.sin(playerAngle) * CLUSTER_INNER_RADIUS;
        source.updateMatrixWorld(true);
        this.character = source;
        this.currentCharacterIdx = idx;
        // Face toward the cluster centre
        const pDx = CLUSTERS[0].x - source.position.x;
        const pDz = CLUSTERS[0].z - source.position.z;
        source.rotation.set(0, Math.atan2(pDx, pDz), 0);
        this._captureAnchorTransform(this.character);
        this.character.userData.baseRotY = this.character.userData.anchorRotY ?? source.rotation.y;

        // New character needs its own mixer
        this.mixer = new THREE.AnimationMixer(this.character);
        this.actions = {};
        this.clips.idle = this.characterIdleClips[idx] || this.characterIdleClips[0] || this.clips.idle;

        // Re-bind every clip to the new mixer
        ['idle', 'walking', 'sad', 'celebrating'].forEach((name) => {
            const action = this._getActionForMixer(this.mixer, idx, name, this.character);
            if (action) {
                this.actions[name] = action;
            }
        });

        // Resume whatever was playing before
        const resumeName   = this._currentAnimName || 'idle';
        const resumeAction = this.actions[resumeName] || this.actions.idle;
        resumeAction.play();
        this.currentAction = resumeAction;

        console.log(`[SceneManager] Player switched to character ${idx}: ${CHAR_META[idx]?.name}`);
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

        if (mode === 'first') {
            this._updateFirstPersonCamera(true);
        } else {
            this._applyCameraPreset(CAM_3P, true); // true = use GSAP tween
        }

        // Crowd is visible in BOTH camera modes — the whole population is always shown
        this.crowdGroup.visible = true;

        // In first-person, hide the player mesh (you can't see yourself from POV)
        if (this.character) {
            this.character.visible = (mode !== 'first');
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
        this._applyCameraPose(
            new THREE.Vector3(preset.position.x, preset.position.y, preset.position.z),
            new THREE.Vector3(preset.target.x, preset.target.y, preset.target.z),
            animate
        );
    }

    /**
     * _applyCameraPose(position, target, animate)
     * --------------------------------------------------------------
     * Either snaps or tweens the camera to explicit world-space vectors.
     *
     * @param {THREE.Vector3} position
     * @param {THREE.Vector3} target
     * @param {boolean} animate
     */
    _applyCameraPose(position, target, animate) {
        if (!animate) {
            this.camera.position.copy(position);
            this.camTarget.copy(target);
            this.camera.lookAt(this.camTarget);
            return;
        }

        // GSAP tween the camera's position object
        this._camTween = gsap.timeline()
            .to(this.camera.position, {
                x: position.x,
                y: position.y,
                z: position.z,
                duration: 1.2,
                ease: 'power2.inOut',
            })
            .to(this.camTarget, {          // simultaneously tween the look-at target
                x: target.x,
                y: target.y,
                z: target.z,
                duration: 1.2,
                ease: 'power2.inOut',
            }, '<');                       // '<' means start at same time as previous tween
    }

    /**
     * _getFirstPersonPose()
     * --------------------------------------------------------------
     * Computes a true POV camera pose from the selected character's upper
     * rig so first-person view matches where the character is looking.
     *
     * @returns {{ position: THREE.Vector3, target: THREE.Vector3 } | null}
     */
    _getFirstPersonPose() {
        if (!this.character) return null;

        this.character.updateMatrixWorld(true);

        const headPos = this._findRigPoint(this.character, /headtopend|headend|head/);
        const neckPos = this._findRigPoint(this.character, /neck|spine2|spine1|spine/);
        const fallback = new THREE.Vector3();
        this.character.getWorldPosition(fallback);

        const eyePos = headPos
            ? headPos.clone().lerp(neckPos || headPos, 0.18)
            : fallback.add(new THREE.Vector3(CAM_1P.position.x, CAM_1P.position.y, CAM_1P.position.z));

        // These character GLBs face down +Z in the current scene setup.
        // Using -Z here made the POV look the wrong way and feel unchanged.
        const forward = new THREE.Vector3(0, 0, 1);
        const worldQuat = new THREE.Quaternion();
        this.character.getWorldQuaternion(worldQuat);
        forward.applyQuaternion(worldQuat).normalize();

        const eyeOffset = forward.clone().multiplyScalar(0.05);
        const position = eyePos.add(eyeOffset);
        const target = position.clone().add(forward.multiplyScalar(8));

        return { position, target };
    }

    /**
     * _updateFirstPersonCamera(forceSnap)
     * --------------------------------------------------------------
     * Locks the camera to the player character's POV.
     *
     * @param {boolean} forceSnap
     */
    _updateFirstPersonCamera(forceSnap = false) {
        const pose = this._getFirstPersonPose();
        if (!pose) {
            this._applyCameraPreset(CAM_1P, forceSnap ? false : true);
            return;
        }

        this._applyCameraPose(pose.position, pose.target, !forceSnap);
    }

    // ─── 5. CROWD SYSTEM ─────────────────────────────────────────────────────

    /**
     * _buildCrowd()
     * --------------------------------------------------------------
    * Clones the main character CROWD_SIZE times and places them
    * in a shallow crowd arc in front of the player.
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

        // Distribute crowd across several small clusters.
        // Each cluster gets roughly CROWD_SIZE / CLUSTERS.length members.
        const membersPerCluster = Math.ceil(CROWD_SIZE / CLUSTERS.length);
        const positions = [];
        for (let i = 0; i < CROWD_SIZE; i++) {
            const ci = Math.floor(i / membersPerCluster) % CLUSTERS.length;
            const center = CLUSTERS[ci];
            const posInCluster = i % membersPerCluster;
            const total = Math.min(membersPerCluster, CROWD_SIZE - ci * membersPerCluster);
            // For cluster 0, reserve slot 0 (angle 0) for the player character
            // so no crowd member overlaps with them.  Shift crowd slots by 1.
            const slotCount = (ci === 0) ? total + 1 : total;
            const slot      = (ci === 0) ? posInCluster + 1 : posInCluster;
            const angle = (slot / slotCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
            const r = total <= 1 ? 0 : CLUSTER_INNER_RADIUS * (0.5 + Math.random() * 0.5);
            positions.push({
                x: center.x + Math.cos(angle) * r,
                z: center.z + Math.sin(angle) * r,
                cx: center.x,
                cz: center.z,
            });
        }

        for (let i = 0; i < CROWD_SIZE; i++) {
            const pos = positions[i];
            const x = pos.x;
            const z = pos.z;

            // Pick a character body from the pool (seeded so it's stable
            // across re-renders). Falls back to the primary character if
            // extra GLBs haven't been added yet.
            const poolIdx  = i % this.characterPool.length;
            const source   = this.characterPool[poolIdx] || this.character;

            // Clone the character (skeleton-aware clone).
            // traverse() forces visibility on every descendant node.
            const clone = THREE.SkeletonUtils.clone(source);
            this._prepareCloneInstance(clone);

            // Disable shadow casting on crowd clones to save draw calls.
            // With 99 agents, shadow mapping would multiply GPU work enormously.
            clone.traverse(n => { if (n.isMesh) n.castShadow = false; });

            // Apply randomised skin/clothing so crowd members look different
            this._applyRandomSkin(clone, i);

            // Position in front of the player, preserving the source model's
            // own Y offset so characters whose GLB root isn't exactly at foot
            // level still stand on the ground correctly.
            clone.position.set(
                x,
                source.position.y,
                z
            );

            // Face toward their own cluster centre so members look at each
            // other across the cluster.
            //
            // atan2(dx, dz) gives the rotation.y that aligns the model's
            // local +Z axis with the (dx, 0, dz) world direction.  Since
            // the Mixamo GLBs' visual front is along local +Z this makes
            // the character face toward the cluster centre.
            const dx = pos.cx - x;
            const dz = pos.cz - z;
            const baseRotY = Math.atan2(dx, dz);
            // Reset rotation to identity first, then apply only Y rotation.
            // This prevents any residual rotation from the clone source or
            // Euler decomposition artifacts from affecting the facing.
            clone.rotation.set(0, baseRotY, 0);
            clone.updateMatrixWorld(true);
            clone.userData.baseRotY = baseRotY;

            // Scale variation: copy the source's own scale (which may differ
            // per character) then apply a ±5% random tweak for visual variety.
            // Using setScalar here would erase axis-specific scale differences.
            clone.scale.copy(source.scale);
            const variation = 0.95 + Math.random() * 0.10;
            clone.scale.multiplyScalar(variation);
            this._captureAnchorTransform(clone);

            // Each clone needs its own mixer
            const mixer = new THREE.AnimationMixer(clone);

            // Default: play idle
            const action = this._getActionForMixer(mixer, poolIdx, 'idle', clone);
            action?.play();

            this.crowdGroup.add(clone);
            this.crowdMixers.push(mixer);
            this.crowdActions.push({ current: action, mixer, charIdx: poolIdx, object: clone });
        }

        // ── Create percentile-dot sprites above each crowd member ──
        this._crowdDots.forEach(s => this.scene.remove(s));
        this._crowdDots = [];
        for (let i = 0; i < this.crowdGroup.children.length; i++) {
            const dot = this._makeDotSprite('gray');
            this.scene.add(dot);
            this._crowdDots.push(dot);
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
            const mixerObj  = this.crowdActions[i];
            if (!mixerObj) return;

            const animName  = BRACKET_ANIMATION[bracket] || 'idle';
            const nextAction = this._getActionForMixer(
                mixerObj.mixer,
                mixerObj.charIdx,
                animName,
                mixerObj.object
            );
            if (!nextAction) return;

            if (mixerObj.current === nextAction) return;

            nextAction.reset().play();
            if (mixerObj.current) {
                mixerObj.current.crossFadeTo(nextAction, 0.8, false);
            }
            mixerObj.current = nextAction;
        });
    }

    // ─── 5b. MATERIAL HELPERS ─────────────────────────────────────────────────

    /**
     * _fixMaterials(object)
     * --------------------------------------------------------------
     * Walks every mesh in an object and applies:
     *  - sRGB encoding on diffuse / emissive textures (r134 API)
     *  - depthWrite:false + DoubleSide on alpha-transparent parts
     *    (teeth, eyelashes, hair planes) so they don't z-fight or
     *    clip through each other and look broken
     *  - shadow flags
     */
    _fixMaterials(object) {
        object.traverse((node) => {
            if (!node.isMesh) return;
            node.castShadow    = true;
            node.receiveShadow = true;

            const mats = Array.isArray(node.material)
                ? node.material
                : [node.material];

            mats.forEach((mat) => {
                if (!mat) return;

                // Only colour-space maps use sRGB; PBR data maps (normal,
                // roughness, metalness) are linear and must NOT be touched.
                if (mat.map)         mat.map.encoding         = THREE.sRGBEncoding;
                if (mat.emissiveMap) mat.emissiveMap.encoding = THREE.sRGBEncoding;

                // Alpha-transparent parts (teeth, hair planes, eyelashes)
                // must not write to the depth buffer or they occlude each
                // other incorrectly; DoubleSide fixes thin-plane geometry.
                if (mat.transparent || mat.alphaTest > 0 ||
                    /hair|lash|brow|teeth|tooth/i.test(mat.name || '')) {
                    mat.transparent = true;
                    mat.depthWrite  = false;
                    mat.side        = THREE.DoubleSide;
                }
            });
        });
    }

    /**
     * _prepareCloneSource(object)
     * --------------------------------------------------------------
     * Keeps a template model hidden in the scene while still forcing all
     * bone/world matrices to be ready for SkeletonUtils cloning.
     *
     * @param {THREE.Object3D} object
     */
    _prepareCloneSource(object) {
        if (!object) return;

        if (object.parent !== this.scene) {
            this.scene.add(object);
        }

        object.updateMatrixWorld(true);
        object.traverse((node) => {
            if (node.isBone) {
                node.updateMatrixWorld(true);
            }

            if (node.isSkinnedMesh) {
                node.frustumCulled = false;
                node.bindMatrixInverse.copy(node.bindMatrix).invert();
                node.skeleton?.update();
                node.geometry?.computeBoundingSphere?.();
                node.geometry?.computeBoundingBox?.();
            }
        });
    }

    /**
     * _prepareCloneInstance(object)
     * --------------------------------------------------------------
     * Makes every descendant visible and disables frustum culling on skinned
     * meshes so animated clones do not disappear because of stale bounds.
     *
     * @param {THREE.Object3D} object
     */
    _prepareCloneInstance(object) {
        if (!object) return;

        object.traverse((node) => {
            node.visible = true;
            if (node.isSkinnedMesh) {
                node.frustumCulled = false;
                node.geometry?.computeBoundingSphere?.();
                node.geometry?.computeBoundingBox?.();
            }
        });

        object.updateMatrixWorld(true);
    }

    /**
     * _normalizeNodeName(name)
     * --------------------------------------------------------------
     * Reduces naming differences between Mixamo rigs so animation tracks can
     * be matched even when Blender changed armature prefixes.
     *
     * @param {string} name
     * @returns {string}
     */
    _normalizeNodeName(name) {
        return String(name || '')
            .split(/[\/|:]/)
            .pop()
            .toLowerCase()
            .replace(/^mixamorig/, '')
            .replace(/[^a-z0-9]/g, '');
    }

    /**
     * _getNodeLookup(object)
     * --------------------------------------------------------------
     * Builds exact + normalized name lookups for an object hierarchy so
     * retargeted clips can bind to the correct nodes.
     *
     * @param {THREE.Object3D} object
     * @returns {{ exact: Map<string,string>, normalized: Map<string,string> }}
     */
    _getNodeLookup(object) {
        if (!object) return { exact: new Map(), normalized: new Map() };
        if (this._nodeLookupCache.has(object)) {
            return this._nodeLookupCache.get(object);
        }

        const lookup = {
            exact: new Map(),
            normalized: new Map(),
        };

        object.traverse((node) => {
            if (!node.name) return;
            lookup.exact.set(node.name, node.name);

            const normalized = this._normalizeNodeName(node.name);
            if (normalized && !lookup.normalized.has(normalized)) {
                lookup.normalized.set(normalized, node.name);
            }
        });

        this._nodeLookupCache.set(object, lookup);
        return lookup;
    }

    /**
     * _parseTrackBinding(trackName)
     * --------------------------------------------------------------
     * Extracts the animated node name and property path from a Three.js track
     * name. Supports both direct node bindings and SkinnedMesh bone syntax.
     *
     * Examples:
     *   mixamorigHips.position         -> { sourceNodeName: 'mixamorigHips', propertyPath: 'position' }
     *   .bones[mixamorigSpine].quat... -> { sourceNodeName: 'mixamorigSpine', propertyPath: 'quaternion' }
     *
     * @param {string} trackName
     * @returns {{ sourceNodeName: string, propertyPath: string, bindingType: string } | null}
     */
    _parseTrackBinding(trackName) {
        const name = String(trackName || '');

        const boneMatch = name.match(/(?:^|\.)bones\[([^\]]+)\]\.(.+)$/);
        if (boneMatch) {
            return {
                sourceNodeName: boneMatch[1],
                propertyPath: boneMatch[2],
                bindingType: 'bone',
            };
        }

        const firstDot = name.indexOf('.');
        if (firstDot === -1) return null;

        return {
            sourceNodeName: name.slice(0, firstDot),
            propertyPath: name.slice(firstDot + 1),
            bindingType: 'node',
        };
    }

    /**
     * _findPrimarySkinnedMesh(object)
     * --------------------------------------------------------------
     * Returns the first skinned mesh within an object hierarchy.
     *
     * @param {THREE.Object3D} object
     * @returns {THREE.SkinnedMesh|null}
     */
    _findPrimarySkinnedMesh(object) {
        let found = null;
        object?.traverse((node) => {
            if (!found && node.isSkinnedMesh) {
                found = node;
            }
        });
        return found;
    }

    /**
     * _retargetClipForObject(clip, object, cacheKey)
     * --------------------------------------------------------------
     * Rewrites track target names from shared animation GLBs so they bind to
     * the selected character's actual rig node names.
     *
     * @param {THREE.AnimationClip} clip
     * @param {THREE.Object3D} object
     * @param {string} cacheKey
     * @returns {THREE.AnimationClip|null}
     */
    _retargetClipForObject(clip, object, cacheKey) {
        if (!clip || !object) return null;

        const cacheId = `${cacheKey}::${clip.uuid}`;
        if (this._retargetedClipCache.has(cacheId)) {
            return this._retargetedClipCache.get(cacheId);
        }

        const lookup = this._getNodeLookup(object);
        const tracks = [];

        clip.tracks.forEach((track) => {
            const binding = this._parseTrackBinding(track.name);
            if (!binding) return;

            const { sourceNodeName, propertyPath } = binding;

            let targetNodeName = lookup.exact.get(sourceNodeName);
            if (!targetNodeName) {
                targetNodeName = lookup.normalized.get(this._normalizeNodeName(sourceNodeName));
            }
            if (!targetNodeName) return;

            const nextTrack = track.clone();
            nextTrack.name = `${targetNodeName}.${propertyPath}`;
            tracks.push(nextTrack);
        });

        if (!tracks.length) {
            this._retargetedClipCache.set(cacheId, null);
            if (!this._retargetWarnings.has(cacheId)) {
                this._retargetWarnings.add(cacheId);
                console.warn(`[SceneManager] No compatible tracks found for clip "${clip.name}" on ${CHAR_META[cacheKey.split(':')[0]]?.name || 'character'}.`);
            }
            return null;
        }

        const retargeted = new THREE.AnimationClip(
            `${clip.name || 'clip'}__${cacheKey}`,
            clip.duration,
            tracks
        );
        retargeted.blendMode = clip.blendMode;
        this._retargetedClipCache.set(cacheId, retargeted);
        return retargeted;
    }

    /**
     * _buildBoneNameMap(targetMesh, sourceMesh)
     * --------------------------------------------------------------
     * Builds a target->source bone-name mapping based on normalized names.
     *
     * @param {THREE.SkinnedMesh} targetMesh
     * @param {THREE.SkinnedMesh} sourceMesh
     * @returns {Object<string, string>}
     */
    _buildBoneNameMap(targetMesh, sourceMesh) {
        const mapping = {};
        if (!targetMesh?.skeleton || !sourceMesh?.skeleton) return mapping;

        const targetBones = targetMesh.skeleton.bones;
        const sourceBones = sourceMesh.skeleton.bones;
        const sourceByNormalized = new Map();
        sourceBones.forEach((bone) => {
            const normalized = this._normalizeNodeName(bone.name);
            if (normalized && !sourceByNormalized.has(normalized)) {
                sourceByNormalized.set(normalized, bone.name);
            }
        });

        targetBones.forEach((bone) => {
            const normalized = this._normalizeNodeName(bone.name);
            const sourceName = sourceByNormalized.get(normalized);
            if (sourceName) {
                mapping[bone.name] = sourceName;
            }
        });

        // Fallback for rigs that keep Mixamo bone order but rename every bone.
        // This is common after Blender import/export pipelines.
        const pairCount = Math.min(targetBones.length, sourceBones.length);
        for (let i = 0; i < pairCount; i++) {
            const targetBone = targetBones[i];
            const sourceBone = sourceBones[i];
            if (targetBone?.name && sourceBone?.name && !mapping[targetBone.name]) {
                mapping[targetBone.name] = sourceBone.name;
            }
        }

        return mapping;
    }

    /**
     * _findHipBoneName(mesh)
     * --------------------------------------------------------------
     * Finds the most likely hip/root bone for a skeleton.
     *
     * @param {THREE.SkinnedMesh} mesh
     * @returns {string}
     */
    _findHipBoneName(mesh) {
        const bones = mesh?.skeleton?.bones || [];
        const hipBone = bones.find((bone) => /hip|hips/.test(this._normalizeNodeName(bone.name)));
        return hipBone?.name || bones[0]?.name || 'hip';
    }

    /**
     * _retargetSharedClipForCharacter(idx, name, object)
     * --------------------------------------------------------------
     * Retargets a shared animation clip to a specific character, preferring
     * Three's built-in skeleton retargeter and falling back to manual track
     * rewriting when needed.
     *
     * @param {number} idx
     * @param {string} name
     * @param {THREE.Object3D} object
     * @returns {THREE.AnimationClip|null}
     */
    _retargetSharedClipForCharacter(idx, name, object) {
        const clip = this.clips[name];
        if (!clip || !object) return null;

        const cacheId = `shared:${idx}:${name}`;
        if (this._retargetedClipCache.has(cacheId)) {
            return this._retargetedClipCache.get(cacheId);
        }

        // Always use the manual track-rewrite path.
        //
        // THREE.SkeletonUtils.retargetClip (r134) emits tracks in
        // `.bones[boneName].quaternion` format, which requires the
        // AnimationMixer binding root to be a SkinnedMesh with a .skeleton.
        // Our mixers are rooted at the character Group, not the SkinnedMesh,
        // so those tracks trigger "Can not bind to bones as node does not
        // have a skeleton" and silently no-op — leaving all joints at
        // identity/zero and exploding the mesh.
        //
        // _retargetClipForObject writes plain `boneName.quaternion` tracks
        // instead, which PropertyBinding resolves by walking the scene-graph
        // from the mixer root.  No skeleton root needed, works correctly.
        const retargeted = this._retargetClipForObject(clip, object, `${idx}:${name}`);
        this._retargetedClipCache.set(cacheId, retargeted);
        return retargeted;
    }

    /**
     * _getActionForMixer(mixer, idx, name, object)
     * --------------------------------------------------------------
     * Creates or retrieves an action using the correct binding root.
     * Retargeted shared clips bind to the primary skinned mesh.
     *
     * @param {THREE.AnimationMixer} mixer
     * @param {number} idx
     * @param {string} name
     * @param {THREE.Object3D} object
     * @returns {THREE.AnimationAction|null}
     */
    _getActionForMixer(mixer, idx, name, object) {
        if (!mixer || !object) return null;

        const clip = this._getClipForCharacter(idx, name, object);
        if (!clip) return null;

        // Always bind relative to the mixer root (the character group).
        // Do NOT pass the SkinnedMesh as optional root — in a Mixamo GLB the
        // bones are siblings of the SkinnedMesh under the Armature, NOT its
        // descendants.  Passing the mesh as root causes Three.js PropertyBinding
        // to search the wrong subtree, find nothing, and emit zero/identity
        // transforms that pull every joint to the origin ("fall to pieces").
        return mixer.clipAction(clip);
    }

    /**
     * _getClipForCharacter(idx, name, object)
     * --------------------------------------------------------------
     * Returns the best animation clip for a specific character.
     * Idle uses the character's own embedded clip; other states use shared
     * clips retargeted to that character's rig.
     *
     * @param {number} idx
     * @param {string} name
     * @param {THREE.Object3D} object
     * @returns {THREE.AnimationClip|null}
     */
    _getClipForCharacter(idx, name, object) {
        if (name === 'idle') {
            return this.characterIdleClips[idx] || this.characterIdleClips[0] || null;
        }

        return this._retargetSharedClipForCharacter(idx, name, object);
    }

    /**
     * _captureAnchorTransform(object)
     * --------------------------------------------------------------
     * Stores the intended root transform of a character so we can reapply
     * it after the animation mixer runs. Some GLBs contain root-motion
     * tracks that otherwise launch the whole model out of frame.
     *
     * @param {THREE.Object3D} object
     */
    _captureAnchorTransform(object) {
        if (!object) return;

        object.userData.anchorPosition  = object.position.clone();
        object.userData.anchorQuaternion = object.quaternion.clone();
        // anchorRotY is a plain number GSAP can tween freely without
        // Three.js quaternion synchronisation fighting against it.
        object.userData.anchorRotY      = object.rotation.y;
        object.userData.anchorScale     = object.scale.clone();
    }

    /**
     * _restoreAnchorTransform(object)
     * --------------------------------------------------------------
     * Reapplies the stored root transform after animation updates so the
     * clip animates the skeleton, not the entire character root.
     *
     * @param {THREE.Object3D} object
     */
    _restoreAnchorTransform(object) {
        if (!object) return;

        const { anchorPosition, anchorQuaternion, anchorRotY, anchorScale } = object.userData;
        if (anchorPosition)  object.position.copy(anchorPosition);
        // Set rotation directly from the stored Y angle.  Previously we
        // restored the full quaternion first, but the Euler↔quaternion
        // round-trip could introduce tiny X/Z drift that accumulated
        // over frames.  Since our characters only need Y rotation we
        // just set Euler (0, anchorRotY, 0) and let Three.js derive
        // the quaternion once.
        if (anchorRotY !== undefined) object.rotation.set(0, anchorRotY, 0);
        if (anchorScale)     object.scale.copy(anchorScale);
        object.updateMatrixWorld(true);
    }

    /**
     * _applyRandomSkin(clone, seed)
     * --------------------------------------------------------------
     * Gives each crowd clone unique clothing and skin colours so the
     * crowd looks like different people rather than copies.
     *
     * We clone every material first (so instances never share a
     * material object), then:
     *  - skin/head materials → random tone from a palette
     *  - clothing materials  → hue-rotated by a deterministic amount
     *
     * Uses a seeded pseudo-RNG so the crowd looks the same each time
     * the scene is built (no flickering on re-render).
     *
     * @param {THREE.Object3D} clone
     * @param {number}         seed   Integer index (0…CROWD_SIZE)
     */
    _applyRandomSkin(clone, seed) {
        // Tiny seeded pseudo-RNG  (sin-hash, good enough for visuals)
        const rng = (n) => {
            const x = Math.sin(seed * 127.1 + n * 311.7) * 43758.5453;
            return x - Math.floor(x);
        };

        // Pick a clothing hue shift (avoid the skin-tone range)
        const clothingHues = [
            0.55, 0.60, 0.65, 0.70,  // blues
            0.12, 0.15, 0.30, 0.35,  // yellows / greens
            0.80, 0.85, 0.90, 0.00,  // pinks / reds
        ];
        const hueShift = clothingHues[
            Math.floor(rng(0) * clothingHues.length)
        ];

        // Skin tone palette (light → dark)
        const skinTones = [
            0xf5cba7, 0xe8b88a, 0xd4956a, 0xc27040, 0x8d5524,
        ];
        const skinColour = new THREE.Color(
            skinTones[Math.floor(rng(1) * skinTones.length)]
        );

        clone.traverse((node) => {
            if (!node.isMesh) return;

            // Always clone-per-instance so colour changes stay local
            if (Array.isArray(node.material)) {
                node.material = node.material.map(m => m ? m.clone() : m);
            } else if (node.material) {
                node.material = node.material.clone();
            }

            const mats = Array.isArray(node.material)
                ? node.material
                : [node.material];

            mats.forEach((mat, mi) => {
                if (!mat) return;
                const name = (mat.name || '').toLowerCase();

                // Skip hair/lash/brow/eye
                if (/hair|lash|brow|eye/i.test(name)) return;

                // Skip teeth — keep them white
                if (/teeth|tooth/i.test(name)) return;

                // If this material uses a diffuse texture, the texture provides
                // the colour. mat.color is a multiplier (should stay white = 1,1,1).
                // Tinting it would darken the character, possibly to black.
                // Only modify materials that are purely colour-driven (no map).
                if (mat.map) return;

                if (/skin|body|head|face/i.test(name)) {
                    mat.color.multiply(skinColour);
                } else {
                    // Clothing — rotate hue, but only if there's meaningful
                    // saturation/lightness to rotate (skip near-black materials)
                    const hsl = {};
                    mat.color.getHSL(hsl);
                    if (hsl.l > 0.05) {
                        mat.color.setHSL(
                            (hsl.h + hueShift) % 1,
                            Math.min(1, hsl.s * (0.8 + rng(mi + 5) * 0.4)),
                            hsl.l
                        );
                    }
                }
            });
        });
    }

    // ─── 5c. MONEY PARTICLE SYSTEM ───────────────────────────────────────────

    /**
     * _spawnMoneyParticle(fromWorldPos, toWorldPos)
     * --------------------------------------------------------------
     * Creates a coin emoji sprite that arcs from one 3-D world position
     * to another over ~0.8 s, then removes itself.
     *
     * The sprite uses a tiny off-screen canvas as its texture so we need
     * zero external asset files.
     *
     * @param {THREE.Vector3} fromWorldPos
     * @param {THREE.Vector3} toWorldPos
     */
    _spawnMoneyParticle(fromWorldPos, toWorldPos) {
        if (!fromWorldPos || !toWorldPos) return;

        // Build a 64×64 canvas with a single coin emoji centred on it
        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.font = `${size * 0.72}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💰', size / 2, size / 2);

        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({
            map:       texture,
            transparent: true,
            depthTest: false,   // always drawn on top of other objects
        });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(0.45, 0.45, 1);
        sprite.position.copy(fromWorldPos);
        this.scene.add(sprite);

        const from     = fromWorldPos.clone();
        const to       = toWorldPos.clone();
        const DURATION = 0.75;  // seconds
        let   elapsed  = 0;

        const particle = {
            done: false,
            update(dt) {
                elapsed += dt;
                const t = Math.min(elapsed / DURATION, 1);

                // Lerp position, add a vertical parabolic arc
                const pos = from.clone().lerp(to, t);
                pos.y += Math.sin(t * Math.PI) * 1.1;
                sprite.position.copy(pos);

                // Fade in/out at the edges of the flight
                material.opacity =
                    t < 0.12 ? t / 0.12 :
                    t > 0.78 ? (1 - t) / 0.22 :
                    1;

                if (t >= 1) this.done = true;
            },
            dispose(scene) {
                scene.remove(sprite);
                texture.dispose();
                material.dispose();
            },
        };

        this._moneyParticles.push(particle);
    }

    /**
     * clearParticles()
     * --------------------------------------------------------------
     * Removes all in-flight money particle sprites immediately.
     * Called when the simulation stops so stale particles don't keep
     * flying after the last step.
     */
    clearParticles() {
        for (let i = this._moneyParticles.length - 1; i >= 0; i--) {
            this._moneyParticles[i].dispose(this.scene);
        }
        this._moneyParticles.length = 0;
    }

    // ─── 5d. PERCENTILE DOT SYSTEM ───────────────────────────────────────────

    /**
     * _getDotTexture(colorKey)
     * Returns a cached 16×16 circle canvas texture for 'red','yellow','green','gray'.
     */
    _getDotTexture(colorKey) {
        if (this._dotTextures[colorKey]) return this._dotTextures[colorKey];
        const size = 16;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const colors = { red: '#ef4444', yellow: '#eab308', green: '#22c55e', gray: '#6b7280' };
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
        ctx.fillStyle = colors[colorKey] || colors.gray;
        ctx.fill();
        const tex = new THREE.CanvasTexture(canvas);
        this._dotTextures[colorKey] = tex;
        return tex;
    }

    /**
     * _makeDotSprite(colorKey)
     * Creates a small sprite with the given colour dot texture.
     */
    _makeDotSprite(colorKey) {
        const mat = new THREE.SpriteMaterial({
            map: this._getDotTexture(colorKey),
            transparent: true,
            depthTest: false,
        });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(0.18, 0.18, 1);
        sprite.userData._dotColor = colorKey;
        return sprite;
    }

    /**
     * _updateDotColors(crowdWealth)
     * Sets each crowd dot to red / yellow / green based on the wealth
     * percentile of that crowd member within the full population.
     * @param {number[]} crowdWealth  wealth values per crowd slot
     */
    _updateDotColors(crowdWealth) {
        if (!crowdWealth || !crowdWealth.length) return;
        // Build sorted copy to derive percentile thresholds
        const sorted = [...crowdWealth].sort((a, b) => a - b);
        const n = sorted.length;
        const p33 = sorted[Math.floor(n * 0.33)] ?? 0;
        const p66 = sorted[Math.floor(n * 0.66)] ?? 0;

        for (let i = 0; i < this._crowdDots.length; i++) {
            const w = crowdWealth[i] ?? 0;
            const key = w <= p33 ? 'red' : w <= p66 ? 'yellow' : 'green';
            const dot = this._crowdDots[i];
            if (dot.userData._dotColor !== key) {
                dot.material.map = this._getDotTexture(key);
                dot.material.needsUpdate = true;
                dot.userData._dotColor = key;
            }
        }
    }

    /**
     * _positionDots()
     * Moves each dot sprite to float above its crowd member's head.
     * Called every frame in animate().
     */
    _positionDots() {
        for (let i = 0; i < this._crowdDots.length; i++) {
            const member = this.crowdGroup.children[i];
            const dot = this._crowdDots[i];
            if (!member || !dot) continue;
            const pos = new THREE.Vector3();
            member.getWorldPosition(pos);
            pos.y += 2.15;  // just above head
            dot.position.copy(pos);
        }
    }

    /**
     * _nudgeCrowdMember(memberIdx, targetWorldPos)
     * --------------------------------------------------------------
     * Briefly steps a crowd member 20% toward a target position then
     * returns them to their original spot, simulating movement to
     * complete a transaction.
     *
     * Works by tweening the userData.anchorPosition that
     * _restoreAnchorTransform() enforces every frame.
     *
     * @param {number}          memberIdx      Index in crowdGroup.children
     * @param {THREE.Vector3}   targetWorldPos World position to step toward
     */
    _nudgeCrowdMember(memberIdx, targetWorldPos) {
        const member = this.crowdGroup.children[memberIdx];
        if (!member || !member.userData.anchorPosition) return;

        const anchor = member.userData.anchorPosition;  // this IS the live object
        const origX  = anchor.x;
        const origZ  = anchor.z;

        // Step 20% toward the target (stay on the ground plane)
        const nudgeX = origX + (targetWorldPos.x - origX) * 0.20;
        const nudgeZ = origZ + (targetWorldPos.z - origZ) * 0.20;

        // Face the target while stepping
        const faceAngle = Math.atan2(
            targetWorldPos.x - member.position.x,
            targetWorldPos.z - member.position.z
        );

        // Face the target: tween anchorRotY (not member.rotation directly, because
        // _restoreAnchorTransform overwrites rotation from anchorQuaternion every
        // frame and would immediately cancel a direct rotation tween).
        const baseRotY = member.userData.baseRotY ?? member.userData.anchorRotY ?? 0;

        gsap.timeline()
            .to(anchor, { x: nudgeX, z: nudgeZ, duration: 0.22, ease: 'power1.out' })
            .to(anchor, { x: origX,  z: origZ,  duration: 0.30, ease: 'power1.in', delay: 0.10 });

        gsap.timeline()
            .to(member.userData, { anchorRotY: faceAngle, duration: 0.18, ease: 'power1.out' })
            .to(member.userData, { anchorRotY: baseRotY,  duration: 0.40, ease: 'power2.inOut', delay: 0.45 });
    }

    /**
     * triggerExchanges(crowdAgentIndices, edges, youAgentIdx)
     * --------------------------------------------------------------
     * Converts model exchange edges into 3-D animations: flying money
     * particles and brief crowd nudges toward transaction partners.
     *
     * Called from update() when the simulation provides exchange data.
     *
     * @param {number[]}   crowdAgentIndices  Model-agent-index for each crowd slot
     * @param {number[][]} edges              [[from_agent_idx, to_agent_idx, amount], ...]
     * @param {number}     youAgentIdx        Model-agent-index of "you"
     */
    triggerExchanges(crowdAgentIndices, edges, youAgentIdx) {
        if (!edges || !edges.length || !crowdAgentIndices) return;
        if (!this.isLoaded) return;

        // Map model agent index → crowd slot (0-based index into crowdGroup.children)
        const agentToCrowd = new Map();
        crowdAgentIndices.forEach((agentIdx, slot) => agentToCrowd.set(agentIdx, slot));

        // Helper: world position of a crowd member's chest
        const crowdPos = (slot) => {
            const obj = this.crowdGroup.children[slot];
            if (!obj) return null;
            const pos = new THREE.Vector3();
            obj.getWorldPosition(pos);
            pos.y += 1.0;
            return pos;
        };

        // Helper: world position of the player character's chest
        const playerPos = () => {
            if (!this.character) return null;
            const pos = new THREE.Vector3();
            this.character.getWorldPosition(pos);
            pos.y += 1.0;
            return pos;
        };

        // Show all exchanges (no cap) so particles reflect actual simulation
        edges.forEach(([from, to, amount]) => {
            const fromIsYou   = (from === youAgentIdx);
            const toIsYou     = (to   === youAgentIdx);
            const fromSlot    = agentToCrowd.get(from);
            const toSlot      = agentToCrowd.get(to);

            const fromPos =
                fromIsYou           ? playerPos()    :
                fromSlot !== undefined ? crowdPos(fromSlot) :
                null;
            const toPos =
                toIsYou             ? playerPos()    :
                toSlot   !== undefined ? crowdPos(toSlot)   :
                null;

            if (!fromPos || !toPos) return;

            // Spawn the coin particle with the actual transfer amount
            this._spawnMoneyParticle(fromPos, toPos, amount);
        });
    }

    /**
     * _nudgePlayer(targetWorldPos)
     * --------------------------------------------------------------
     * Rotates the player character to briefly face a transaction partner
     * then returns to their default forward-facing orientation.
     * Works identically to _nudgeCrowdMember but operates on this.character.
     * In first-person mode the effect is visible because _getFirstPersonPose()
     * reads the character's world quaternion (which anchorRotY drives) each frame.
     *
     * @param {THREE.Vector3} targetWorldPos  World-space position to turn toward
     */
    _nudgePlayer(targetWorldPos) {
        if (!this.character) return;

        const faceAngle = Math.atan2(
            targetWorldPos.x - this.character.position.x,
            targetWorldPos.z - this.character.position.z
        );

        const baseRotY = this.character.userData.baseRotY ?? this.character.userData.anchorRotY ?? 0;

        gsap.timeline()
            .to(this.character.userData, { anchorRotY: faceAngle,  duration: 0.18, ease: 'power1.out' })
            .to(this.character.userData, { anchorRotY: baseRotY,   duration: 0.40, ease: 'power2.inOut', delay: 0.45 });
    }

    // ─── 6. UPDATE (called by app.js each simulation step) ───────────────────

    /**
     * update(data)
     * --------------------------------------------------------------
     * The single entry point app.js calls every time the simulation steps.
     *
     * @param {object}   data
     * @param {string}   data.bracket            'Lower' | 'Middle' | 'Upper'
     * @param {number}   data.wealth             Current wealth value
     * @param {number}   data.percentile         0–100
     * @param {string[]} data.crowdBrackets       Brackets for each crowd member
     * @param {number[]} data.crowdAgentIndices   Model agent index per crowd slot
     * @param {number[][]}data.exchanges          [[from, to], ...] exchange edges
     * @param {number}   data.youAgentIdx         Model agent index of "you"
     */
    update({ bracket, wealth, percentile, youPctLabel, crowdBrackets, crowdAgentIndices, crowdWealth, crowdPctLabel, exchanges, youAgentIdx } = {}) {
        if (!this.isLoaded) return;

        // ── Store per-step data so _updateOverlay() can read it each frame ─
        this._youWealth    = wealth   ?? null;
        this._youPctLabel  = youPctLabel  ?? null;
        if (Array.isArray(crowdWealth))   this._crowdWealth   = crowdWealth;
        if (Array.isArray(crowdPctLabel)) this._crowdPctLabel = crowdPctLabel;

        // ── Update percentile dot colours ─────────────────────────
        if (Array.isArray(crowdWealth)) this._updateDotColors(crowdWealth);

        // ── All agents always play idle — no bracket-based switching ──
        // (player stays in idle; crowd stays in idle)

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
        // All crowd members stay in idle — no bracket-based animation changes

        // ── Trigger money-exchange animations ─────────────────────
        // In first-person the crowd is visible so full exchange choreography
        // runs (nudges + particles).  In third-person we still fire the
        // particle so the player can see coins flying when they transact,
        // but we skip crowd nudges because the crowd itself is hidden.
        if (exchanges && exchanges.length) {
            if (this.cameraMode === 'first') {
                this.triggerExchanges(crowdAgentIndices || [], exchanges, youAgentIdx);
            } else {
                // Third-person: coin particles to/from player only
                const me = exchanges.filter(([f, t]) => f === youAgentIdx || t === youAgentIdx);
                this.triggerExchanges(crowdAgentIndices || [], me, youAgentIdx);
            }
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

        // One-shot diagnostic: log scene contents on the first rendered frame
        // after everything is loaded. Remove this block once the scene is stable.
        if (this.isLoaded && !this._diagDone) {
            this._diagDone = true;
            const directChildren = this.scene.children.length;
            const crowdVisible   = this.crowdGroup.visible;
            const crowdSize      = this.crowdGroup.children.length;
            console.log(
                `[Diag] scene children: ${directChildren} | ` +
                `crowdGroup visible: ${crowdVisible} | ` +
                `crowd members: ${crowdSize} | ` +
                `characterPool: ${this.characterPool.length} | ` +
                `cameraMode: ${this.cameraMode}`
            );
            // Log position of every direct scene child (should be just the player)
            this.scene.children.forEach((child, i) => {
                const p = child.position;
                console.log(`  scene[${i}] name="${child.name}" pos=(${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}) visible=${child.visible}`);
            });
        }

        // Advance character animations
        if (this.mixer) this.mixer.update(delta);
        this._restoreAnchorTransform(this.character);

        // Advance crowd animations — skip frozen (distant) agents to save CPU.
        // Camera position is used as the reference point.
        const camPos = this.camera.position;
        const freezeDistSq = CROWD_MIXER_FREEZE_DIST * CROWD_MIXER_FREEZE_DIST;
        for (let i = 0; i < this.crowdMixers.length; i++) {
            const child = this.crowdGroup.children[i];
            if (!child) continue;
            const dx = child.position.x - camPos.x;
            const dz = child.position.z - camPos.z;
            if (dx * dx + dz * dz < freezeDistSq) {
                this.crowdMixers[i].update(delta);
            }
            this._restoreAnchorTransform(child);
        }

        // Position percentile dots above crowd members
        this._positionDots();

        // Tick and cull money-particle sprites
        for (let i = this._moneyParticles.length - 1; i >= 0; i--) {
            const p = this._moneyParticles[i];
            p.update(delta);
            if (p.done) {
                p.dispose(this.scene);
                this._moneyParticles.splice(i, 1);
            }
        }

        // Crowd is always visible in both modes (whole population shown)
        this.crowdGroup.visible = this.isLoaded;

        if (this.cameraMode === 'first') {
            // POV: hide the player mesh (you can't see yourself)
            if (this.character) this.character.visible = false;
            const pose = this._getFirstPersonPose();
            if (pose) {
                this.camera.position.copy(pose.position);
                this.camTarget.copy(pose.target);
            }
        } else {
            // Third-person: show the player mesh
            if (this.character) this.character.visible = true;
        }

        // Sphere-based hover detection against all characters
        this._updateRaycasting();

        // Keep camera looking at the target (GSAP tweens camTarget each frame)
        this.camera.lookAt(this.camTarget);

        this.renderer.render(this.scene, this.camera);

        // Update HTML overlay labels after render so camera matrices are fresh
        this._updateOverlay();
    }

    // ─── 8. HELPERS ──────────────────────────────────────────────────────────

    /**
     * _onResize()
     * Updates the renderer and camera aspect ratio when the window resizes.
     * Without this the scene would stretch or squash.
     */
    _onResize() {
        const w = this.canvas.clientWidth  || window.innerWidth;
        const h = this.canvas.clientHeight || window.innerHeight;
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

    // ─── 9. OVERLAY LABEL SYSTEM ─────────────────────────────────────────────

    /**
     * _initOverlay()
     * Create all the HTML overlay label divs and append them to the
     * scene container so they can be positioned in world space.
     */
    _initOverlay() {
        const container = this.canvas.parentElement;
        if (!container) return;

        const make = (classes) => {
            const el = document.createElement('div');
            classes.forEach(c => el.classList.add(c));
            el.style.display = 'none';
            container.appendChild(el);
            return el;
        };

        // Player label: bouncing arrow + wealth + percentile
        this._playerLabelEl = make(['scene-label', 'player-label']);
        this._playerLabelEl.innerHTML = `
            <div class="label-arrow">▼</div>
            <div class="label-wealth" id="ol-you-wealth">—</div>
            <div class="label-pct"    id="ol-you-pct"></div>`;

        // Richest label
        this._richestLabelEl = make(['scene-label', 'pop-badge', 'richest-badge']);
        this._richestLabelEl.textContent = '👑 Richest';

        // Poorest label
        this._poorestLabelEl = make(['scene-label', 'pop-badge', 'poorest-badge']);
        this._poorestLabelEl.textContent = '📉 Poorest';

        // Hover tooltip
        this._hoverTipEl = make(['scene-label', 'hover-tip']);
        this._hoverTipEl.innerHTML = `<div id="ol-tip-wealth"></div><div id="ol-tip-pct"></div>`;
    }

    /**
     * _initMouseHandlers()
     * Track mouse position on the canvas for raycasting.
     */
    _initMouseHandlers() {
        const canvas = this.canvas;
        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            this._mouse.x =  ((e.clientX - rect.left)  / rect.width)  * 2 - 1;
            this._mouse.y = -((e.clientY - rect.top)    / rect.height) * 2 + 1;
        });
        canvas.addEventListener('mouseleave', () => {
            this._mouse.set(-999, -999);
        });
    }

    /**
     * _worldToScreen(worldPos)
     * Projects a 3-D world position to 2-D canvas pixel coordinates.
     * Returns { x, y } in pixels, or null if behind the camera.
     *
     * @param {THREE.Vector3} worldPos
     * @returns {{ x: number, y: number } | null}
     */
    _worldToScreen(worldPos) {
        if (!this.camera || !this.canvas) return null;

        const v = worldPos.clone().project(this.camera);

        // Behind the camera (negative w) — don't show
        if (v.z > 1) return null;

        const w = this.canvas.clientWidth;
        const h = this.canvas.clientHeight;
        return {
            x: (v.x * 0.5 + 0.5) * w,
            y: (-v.y * 0.5 + 0.5) * h,
        };
    }

    /**
     * _getCharacterTopWorld(object)
     * Returns a world-space point ~0.35 m above the character head
     * so overlay labels float overhead.
     *
     * @param {THREE.Object3D} object
     * @returns {THREE.Vector3}
     */
    _getCharacterTopWorld(object) {
        if (!object) return new THREE.Vector3();
        const pos = new THREE.Vector3();
        object.getWorldPosition(pos);
        pos.y += 2.1;   // slightly above head
        return pos;
    }

    /**
     * _positionLabel(el, worldPos, offsetY)
     * Move an overlay element to the screen position that corresponds to
     * the given world point.  Hides the element when it is off-screen.
     *
     * @param {HTMLElement}     el
     * @param {THREE.Vector3}   worldPos
     * @param {number}          offsetY  Extra pixel offset upward
     */
    _positionLabel(el, worldPos, offsetY = 0) {
        if (!el) return;
        const screen = this._worldToScreen(worldPos);
        if (!screen) {
            el.style.display = 'none';
            return;
        }
        el.style.display = 'block';
        el.style.left = `${screen.x}px`;
        el.style.top  = `${screen.y - offsetY}px`;
    }

    /**
     * _fmtWealth(n)
     * Short-form wealth formatter matching the HUD formatting in app.js.
     */
    _fmtWealth(n) {
        if (typeof n !== 'number' || !isFinite(n)) return '—';
        if (Math.abs(n) >= 1e9) return `$${(n/1e9).toFixed(1)}B`;
        if (Math.abs(n) >= 1e6) return `$${(n/1e6).toFixed(1)}M`;
        if (Math.abs(n) >= 1e3) return `$${(n/1e3).toFixed(1)}K`;
        return `$${n.toFixed(0)}`;
    }

    /**
     * _updateOverlay()
     * Called each frame after render.  Projects character positions to
     * screen space and moves the HTML labels accordingly.
     */
    _updateOverlay() {
        if (!this.isLoaded) return;

        const fmt = (v) => this._fmtWealth(v);

        // ── Player label (third-person only, hides in first-person) ────────
        if (this._playerLabelEl) {
            const showPlayer = (this.cameraMode === 'third') && this.character &&
                               this._youWealth !== null;
            if (showPlayer) {
                const topPos = this._getCharacterTopWorld(this.character);
                this._positionLabel(this._playerLabelEl, topPos, 0);
                const wEl  = document.getElementById('ol-you-wealth');
                const pEl  = document.getElementById('ol-you-pct');
                if (wEl) wEl.textContent = fmt(this._youWealth);
                if (pEl) pEl.textContent = this._youPctLabel || '';
            } else {
                this._playerLabelEl.style.display = 'none';
            }
        }

        // ── Richest / poorest labels ────────────────────────────────────────
        const showRich = this._richestCrowdSlot !== null;
        const showPoor = this._poorestCrowdSlot !== null;

        if (this._richestLabelEl) {
            if (showRich) {
                const obj = this.crowdGroup.children[this._richestCrowdSlot];
                if (obj) {
                    const richW = this._crowdWealth[this._richestCrowdSlot] ?? null;
                    this._richestLabelEl.textContent = `👑 Richest  ${fmt(richW)}`;
                    this._positionLabel(this._richestLabelEl, this._getCharacterTopWorld(obj), 0);
                } else {
                    this._richestLabelEl.style.display = 'none';
                }
            } else {
                this._richestLabelEl.style.display = 'none';
            }
        }

        if (this._poorestLabelEl) {
            if (showPoor) {
                const obj = this.crowdGroup.children[this._poorestCrowdSlot];
                if (obj) {
                    const poorW = this._crowdWealth[this._poorestCrowdSlot] ?? null;
                    this._poorestLabelEl.textContent = `📉 Poorest  ${fmt(poorW)}`;
                    this._positionLabel(this._poorestLabelEl, this._getCharacterTopWorld(obj), 0);
                } else {
                    this._poorestLabelEl.style.display = 'none';
                }
            } else {
                this._poorestLabelEl.style.display = 'none';
            }
        }

        // ── Hover tooltip ───────────────────────────────────────────────────
        if (this._hoverTipEl) {
            if (this._hoveredSlot !== null) {
                let hoverObj  = null;
                let hoverW    = null;
                let hoverPct  = null;

                if (this._hoveredSlot === -1) {
                    // Player
                    hoverObj  = this.character;
                    hoverW    = this._youWealth;
                    hoverPct  = this._youPctLabel;
                } else {
                    hoverObj  = this.crowdGroup.children[this._hoveredSlot];
                    hoverW    = this._crowdWealth[this._hoveredSlot] ?? null;
                    hoverPct  = this._crowdPctLabel[this._hoveredSlot] ?? null;
                }

                if (hoverObj) {
                    const topPos = this._getCharacterTopWorld(hoverObj);
                    this._positionLabel(this._hoverTipEl, topPos, 0);
                    const wEl = document.getElementById('ol-tip-wealth');
                    const pEl = document.getElementById('ol-tip-pct');
                    if (wEl) wEl.textContent = fmt(hoverW);
                    if (pEl) pEl.textContent = hoverPct || '';
                } else {
                    this._hoverTipEl.style.display = 'none';
                }
            } else {
                this._hoverTipEl.style.display = 'none';
            }
        }
    }

    /**
     * _updateRaycasting()
     * Uses a sphere-based approach to detect which character the mouse is
     * hovering over.  Updates this._hoveredSlot.
     */
    _updateRaycasting() {
        if (!this.isLoaded || !this.camera) return;

        this._raycaster.setFromCamera(this._mouse, this.camera);
        const ray  = this._raycaster.ray;
        const HIT_RADIUS = 0.55;  // metres — generous sphere around each character

        let closestSlot = null;
        let closestDist = Infinity;

        // Check player (third-person mode only)
        if (this.cameraMode === 'third' && this.character && this.character.visible) {
            const cp = new THREE.Vector3();
            this.character.getWorldPosition(cp);
            cp.y += 0.9;  // aim at torso
            const d = ray.distanceToPoint(cp);
            if (d < HIT_RADIUS) {
                closestSlot = -1;
                closestDist = ray.origin.distanceTo(cp);
            }
        }

        // Check crowd members
        this.crowdGroup.children.forEach((obj, i) => {
            const cp = new THREE.Vector3();
            obj.getWorldPosition(cp);
            cp.y += 0.9;
            const d = ray.distanceToPoint(cp);
            if (d < HIT_RADIUS) {
                const distToCam = ray.origin.distanceTo(cp);
                if (distToCam < closestDist) {
                    closestDist = distToCam;
                    closestSlot = i;
                }
            }
        });

        this._hoveredSlot = closestSlot;

        // Change cursor
        this.canvas.style.cursor = (closestSlot !== null) ? 'pointer' : 'default';
    }

} // end class SceneManager
