# Inequality Simulator — LLM Context Document

> This document is intended to provide full project context to a large language model working on this codebase.

---

## Project Overview

**Inequality Simulator** is an agent-based economic simulation that models wealth inequality under different government/economic policies. It is based on the Bouchard-Mézard econophysics model, which applies statistical physics dynamics to economic systems.

The goal is educational: allow users to explore how policies affect wealth distribution, economic mobility, and the Gini coefficient — helping move public discourse beyond 19th-century economic frameworks.

The application runs as a **Flask REST API backend** with a **vanilla HTML/CSS/JavaScript frontend**. An AI assistant (Google Gemini) allows users to generate custom policies via natural language, which are compiled, validated, and injected live into the simulation.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Simulation engine | [Mesa 3.0+](https://mesa.readthedocs.io/) (agent-based modelling) |
| Backend | Flask + Flask-CORS |
| AI integration | Google Gemini (`google-genai`, model: `gemini-2.0-flash` / `gemini-2.5-pro`) |
| Frontend | Vanilla HTML / CSS / JavaScript |
| 3D visualisation | [Three.js](https://threejs.org/) r134 (GLTFLoader, SkeletonUtils, OrbitControls, AnimationMixer) + GSAP 3.12.5 tweens |
| Custom policy UI | [Blockly](https://developers.google.com/blockly) (visual programming blocks) |
| Maths/stats | NumPy, SciPy |
| Config | `python-dotenv`, `GOOGLE_API_KEY` env var |
| Entry point | `run.py` → starts Flask on port 5000 |

> **Note:** Chart.js has been removed. There are no chart visualisations in the UI. The sidebar instead shows two live stat cards (Population Wealth and Gini) that are updated directly via API calls.

---

## File Structure

```
inequality-simulator/
├── app.py               # Flask REST API — all routes, Gemini chat, code validation
├── model.py             # WealthModel (Mesa Model subclass) — core simulation
├── agent.py             # WealthAgent (Mesa Agent subclass) — per-agent step logic
├── policyblocks.py      # Policy classes: WealthExchange, Fascism, Capitalism, Communism
├── utilities.py         # Helper functions: Bartholomew mobility, bracket calculation, churn
├── user_logic.py        # Hot-reloaded custom agent step logic (written by Blockly/AI)
├── custom_policies.py   # Hot-reloaded user-defined policy classes (appended by AI)
├── mcp_server.py        # Standalone MCP-style Flask server for policy generation
├── run.py               # Application entry point
├── backend.py           # (Legacy/alternative backend)
├── blockly/
│   ├── index.html       # Blockly visual editor interface
│   ├── custom_blocks.js # Built-in block definitions
│   └── user_blocks.js   # User-generated block definitions (hot-reloaded)
├── docs/
│   ├── index.html       # Landing page (served at /)
│   ├── landing.html     # Main simulator UI (served at /simulator)
│   ├── app.js           # Frontend JavaScript (simulation control, stat card updates)
│   ├── scene.js         # Three.js SceneManager — 3D character rendering & animation
│   ├── glb-debug.html   # Standalone GLB diagnostic viewer (dev tool)
│   └── assets/          # GLB character models (ben, brian, james, jody, joe, kate,
│                         #   leonard, louise, megan, remy, suzie)
└── explanatory/         # Static explainer pages for each policy
    ├── templates/        # HTML templates (econophysics, capitalism, communism, fascism)
    └── static/           # CSS and JS for explainer animations
```

---

## Simulation Model (`model.py`)

### `WealthModel(mesa.Model)`

**Constructor parameters:**
- `policy` (str, default `"econophysics"`) — which economic policy to run
- `population` (int, default `100`) — number of agents
- `start_up_required` (int 1–3, default `1`) — capital barrier to innovation (used by capitalism policy)
- `patron` (bool, default `False`) — enables patron/client dynamics
- `rng` (int, default `42`) — random seed passed directly to `mesa.Model.__init__`

**Key attributes:**
- `self.policy` — active policy string
- `self.agents` — Mesa AgentSet (Mesa 3.0: do NOT use `model.schedule.agents`)
- `self.brackets` — `[lower_threshold, upper_threshold]` for wealth class bands
- `self.survival_cost` — per-step survival cost; initialised to `1` and **recalculated each step** as the 10th percentile of an exponential distribution scaled to mean agent wealth (`expon.ppf(0.1, scale=mean_wealth)`)
- `self.total` — total wealth in the economy
- `self.comparison_models` — dict of sub-models (only in `"comparison"` mode)
- `self.comparison_results` — dict storing per-policy time series data
- `self.datacollector` — Mesa `DataCollector` tracking `Gini`, `Total`, `Mobility`

**Modes:**
- **Single policy**: creates agents and runs one policy
- **Comparison mode** (`policy="comparison"`): spawns four sub-models (econophysics, fascism, communism, capitalism) and runs them in parallel

**Model-level reporters:**
- `compute_gini(model)` — Gini coefficient (0 = perfect equality, 1 = one agent holds all wealth)
- `total_wealth(model)` — sum of all agent wealth
- `compute_mobility(model)` — mean Bartholomew mobility ratio across all agents

---

## Agent (`agent.py`)

### `WealthAgent(mesa.Agent)`

**Constructor parameters:** `model`, `proportion` (W), `innovation` (I), `party_elite` (bool)

**Key attributes:**
- `self.wealth` — current wealth (initialised to `1`)
- `self.W` — income proportion (normally distributed ~0.2); determines pay rate
- `self.I` — innovation multiplier (Pareto-distributed, clamped to [1, 3])
- `self.party_elite` — bool; top 5th percentile by W; relevant for fascism policy
- `self.bracket` — current wealth class: `"Lower"` / `"Middle"` / `"Upper"`
- `self.previous` — bracket at start of previous step
- `self.bracket_history` — last 20 bracket values (for mobility calculation)
- `self.mobility` — Bartholomew mobility ratio [0, 1]
- `self.innovating` — bool; whether agent is currently in an innovation cycle
- `self.last_paid_uids` — list of `unique_id`s paid during the last step (used by `/api/data/exchanges`)

**Step logic:**
1. Reload `user_logic.py` (hot-reload for live custom code)
2. If `HAS_CUSTOM_LOGIC = True` in `user_logic`, run `user_logic.step(self)` instead of built-in policies
3. Otherwise, dispatch to the appropriate policy block based on `self.model.policy`
4. Recalculate bracket and update `bracket_history`
5. Recalculate `self.mobility` via `calculate_bartholomew_mobility(self)`

---

## Policy Blocks (`policyblocks.py`)

All policies expose an `execute()` method. They are called from `WealthAgent.step()`.

### `WealthExchange` (base econophysics model)
Called by all policies. Three-phase wealth exchange per step:
1. **Get paid**: `agent.wealth += agent.W * agent.wealth` (proportional income)
2. **Survival cost**: pay `model.survival_cost` to a random agent; if broke, reset wealth to 1
3. **Thrive cost**: pay a random agent a proportion of wealth based on their `W`

Each payment records the recipient's `unique_id` into `agent.last_paid_uids`.

### `Fascism`
- Party elites (top 5% by W) collect a 20% tax from non-elite agents each step
- Non-elites participate in `WealthExchange` afterwards
- **Party elites do NOT run `WealthExchange`** — they receive tax income passively and skip all survival/thrive cost payments

### `Communism`
- Each step: redistribute total wealth equally among all agents (`each_wealth = total / population`)
- Agents still participate in `WealthExchange` afterwards

### `Capitalism`
- Agents above an `initial_capital` threshold unlock an innovation cycle
- On innovation start: `agent.W *= agent.I` (income multiplier increases), `agent.I *= 0.5` (diminishing returns)
- When innovation exhausted (`I < 1`): reset and draw new `I` from Pareto distribution
- `initial_capital` is derived via Sturges'-rule binning of the wealth distribution, controlled by `start_up_required` (1=easy, 2=medium, 3=hard)

### `Patron` (imported but less prominent)
- Patron/client relationship; party elites collect from subordinates

---

## Wealth Classes & Mobility (`utilities.py`)

### Brackets
- Calculated dynamically each step using 33rd and 67th percentiles of current wealth distribution
- `"Lower"` = below 33rd percentile; `"Middle"` = 33rd–67th; `"Upper"` = above 67th

### `calculate_bartholomew_mobility(agent)`
- Measures how much an agent moves between wealth classes over time
- Formula: mean absolute bracket change / max possible change (2.0)
- Returns a ratio in [0, 1]; higher = more mobile

### `calculate_churn(model)`
- Counts agents moving up vs. down between brackets in the current step

---

## Flask API (`app.py`)

### Standard routes
| Route | Method | Description |
|---|---|---|
| `/` | GET | Landing page |
| `/simulator` | GET | Main simulator UI |
| `/blockly/` | GET | Blockly editor |
| `/explain/<name>` | GET | Policy explainer pages |

### Simulation API
| Route | Method | Description |
|---|---|---|
| `/api/initialize` | POST | Create new `WealthModel`; accepts `policy`, `population`, `start_up_required`, `patron` |
| `/api/step` | POST | Advance model by one step and collect data |
| `/api/run` | POST | Run multiple steps |
| `/api/status` | GET | Returns `{initialized, policy}` |
| `/api/data/wealth-distribution` | GET | Agent wealth values (or per-policy in comparison mode) |
| `/api/data/mobility` | GET | Agent bracket/mobility/wealth data |
| `/api/data/gini` | GET | Gini coefficient time series |
| `/api/data/total-wealth` | GET | Total wealth time series |
| `/api/data/exchanges` | GET | Returns `{edges: [[from_uid, to_uid], ...]}` — wealth transfer pairs from last step |

### Code / Custom Policy API
| Route | Method | Description |
|---|---|---|
| `/api/chat` | POST | Send natural language prompt to Gemini; returns JSON with `python_code`, `block_json`, `block_generator` |
| `/api/update_code` | POST | Write generated Python to `user_logic.py` (activates custom step logic) |
| `/api/add_custom_policy` | POST | Append a new policy class to `custom_policies.py` |
| `/api/save_block_definition` | POST | Append new Blockly block JS to `user_blocks.js` |
| `/api/reset_code` | POST | Reset `user_logic.py`, `custom_policies.py`, `user_blocks.js` to defaults |
| `/api/system_reset` | POST | Full system reset; also clears `current_model` |

### Global state
```python
current_model: WealthModel | None   # protected by model_lock (threading.Lock)
gemini_client: genai.Client | None
```

---

## AI Policy Generation Pipeline (`app.py` — `/api/chat`)

1. User sends a natural-language policy description
2. Gemini (`gemini-2.0-flash`) is prompted with strict rules to return a JSON object:
   ```json
   {
     "python_code": "class MyPolicy:\n    def execute(self, agent, model): ...",
     "block_json": { "type": "my_policy", ... },
     "block_generator": "Blockly.Python.forBlock['my_policy'] = ..."
   }
   ```
3. `sanitize_ai_response()` strips markdown fences and fixes common Mesa 2→3 mistakes (e.g., `model.schedule.agents` → `model.agents`)
4. `validate_policy_code()` performs a three-stage check:
   - **Syntax**: `compile(code, '<string>', 'exec')`
   - **Runtime**: `exec()` with `MockModel` / `MockAgent` dummies
   - **Execution**: calls `instance.execute(mock_agent)` or `instance.execute(mock_agent, mock_model)`
5. If validation fails, the error (including available model/agent attributes as hints) is fed back to Gemini for self-correction (up to 3 retries)

### Critical Mesa 3.0 rules for AI-generated code
- **Use `model.agents`** — NOT `model.schedule.agents` (Mesa 2 API, removed in 3.0)
- Inside `Agent.step(self)`, access the model as `self.model`
- In Blockly generators, pass `self.model`: e.g., `MyPolicy().execute(self, self.model)`
- The model has `survival_cost` — NOT `survival_amount` or `survival_threshold`
- Available `MockModel` attributes: `agents`, `survival_cost`, `policy`, `population`, `brackets`, `start_up_required`, `patron`, `total`, `comparison_results`, `datacollector`
- Available `MockAgent` attributes: `wealth`, `W`, `I`, `model`, `unique_id`, `bracket`, `bracket_history`, `party_elite`, `mobility`
- Note: `last_paid_uids` exists on the real `WealthAgent` but **not** on `MockAgent` — do not reference it in AI-generated policy code

---

## Hot-Reload System

The simulation supports **live code injection** without restarting the server:

- `user_logic.py` is `importlib.reload()`-ed at the start of every agent step
- Setting `HAS_CUSTOM_LOGIC = True` in that file redirects all agent logic to `user_logic.step(self)`
- `custom_policies.py` is imported inside `user_logic.py` via `from custom_policies import *`
- `user_blocks.js` is appended and loaded dynamically in the Blockly editor

---

## Available Policies (Summary)

| Policy key | Description |
|---|---|
| `"econophysics"` | Base Bouchard-Mézard model; random wealth exchange to survive and thrive |
| `"fascism"` | Party elites (top 5%) collect 20% tax from all non-elites each step |
| `"communism"` | Total wealth redistributed equally each step before exchange |
| `"capitalism"` | Agents above a capital threshold gain an innovation income multiplier |
| `"comparison"` | Runs all four policies simultaneously in sub-models for side-by-side comparison |

---

## Frontend UI (`docs/landing.html`)

The simulator UI has a single permanent view: the **3D scene (person view)**. There is no chart view and no view toggle — Chart.js has been removed entirely.

### Sidebar

The sidebar is collapsible (toggle button at top-left) and contains:

1. **Hidden compatibility elements** (`display:none`) — kept so `app.js` doesn't crash on DOM lookups:
   - `#view-select`, `#population-input`, `#patron-toggle`
   - `#status-text`, `#backend-status`, `#status-policy`, `#status-population`

2. **Live stat cards** — two stacked cards updated every simulation step via `_updateStatCards()`:
   - **Population Wealth** (`#stat-total-wealth`) — formatted as `$X`, `$XK`, `$XM`, or `$XB`
   - **Gini** (`#stat-gini`) — shown to 3 decimal places
   - Each card has an info `?` button that opens the `#info-modal`

3. **Model Configuration** accordion (collapsible, open by default):
   - Policy `<select id="policy-select">` — options: econophysics, fascism, communism, capitalism, comparison

4. **Model Controls** accordion (collapsible, open by default):
   - Initialize Model, Single Step, Start Continuous, Stop Continuous, Open Policy Editor

### Info Modal (`#info-modal`)
- Shared modal used by both stat card `?` buttons and the policy info button
- Content defined in the inline `infoContent` object (keys: `econophysics`, `fascism`, `communism`, `capitalism`, `comparison`, `totalWealth`, `gini`, `wealthDistribution`, `mobility`, `population`)
- Can optionally show a confirm/cancel footer (used for initialization confirmation)

---

## Frontend Logic (`docs/app.js`)

### `InequalitySimulator` class

**Constructor** (`new InequalitySimulator()`):
- Binds DOM elements
- Calls `initializeCharts()` — now safely no-ops (all canvas elements removed; guarded with `null` checks)
- Calls `setView('person')` — immediately switches to person view and lazily initialises the `SceneManager`
- Polls `/api/status` on startup

**Key methods:**

| Method | Description |
|---|---|
| `setView(view)` | Sets `this.currentView`; on first call to `'person'` creates the `SceneManager` via `_initScene()` |
| `_initScene()` | Creates `new SceneManager(canvas)`, calls `.init()`, then `.loadCharacter()` |
| `toggleCameraMode()` | Toggles `SceneManager` between `'third'` and `'first'` person camera |
| `initializeCharts()` | No-op (all chart canvases removed); guarded so missing elements are safely skipped |
| `_updateStatCards()` | Fetches `/data/gini` and `/data/total-wealth` in parallel; updates `#stat-gini` and `#stat-total-wealth`; handles both single-policy and comparison modes |
| `refreshCharts(incremental)` | Always calls `_updateStatCards()` + `updatePersonView()` in parallel (chart update paths are dead code) |
| `updatePersonView()` | Fetches `/data/mobility` and `/data/exchanges`; calls `sceneManager.update(...)` with bracket, wealth, percentile, and crowd data |
| `initializeModel()` | POST `/api/initialize`, then calls `refreshCharts(false)` |
| `stepModel()` | POST `/api/step`, then `refreshCharts(true)` |
| `startContinuousRun()` / `stopContinuousRun()` | Loop calling `stepModel()` with a configurable interval |

**`refreshCharts()` flow:**
```
refreshCharts()
  ├── _updateStatCards()        ← always runs; updates sidebar stat cards
  └── updatePersonView()        ← always runs (currentView is always 'person')
        ├── GET /api/data/mobility
        ├── GET /api/data/exchanges
        └── sceneManager.update({ bracket, wealth, percentile, crowdData })
```

---

## 3D Scene Visualisation (`docs/scene.js`)

The simulator renders an animated 3D character whose behaviour reflects the user's agent in the simulation.

### `SceneManager`

**Constructor:** `new SceneManager(canvas)` — takes the `<canvas id="scene">` element.

**Public API (called by `app.js`):**
| Method | Description |
|---|---|
| `init()` | Build renderer, scene, lights, ground plane |
| `loadCharacter(charIndex)` | Load the chosen GLB from `CHAR_POOL` and pull animation clips |
| `playAnimation(name)` | Crossfade to `idle` / `walking` / `sad` / `celebrating` |
| `setCameraMode(mode)` | GSAP tween between `'third'` and `'first'` person cameras |
| `buildCrowd()` | Clone 18 agents in a ring (used in first-person view) |
| `updateCrowd(crowdData)` | Drive each crowd member's animation from bracket/wealth data |
| `update({ bracket, wealth, percentile, crowdData })` | Called every simulation step; updates main character animation and crowd |

**Bracket → animation mapping:**
| Wealth bracket | Animation |
|---|---|
| `Lower` | `sad` |
| `Middle` | `walking` |
| `Upper` | `celebrating` |

**Camera modes:**
- **Third-person** (`CAM_3P`): position `(0, 5.5, −7.0)`, target `(0, 0.5, 2.5)` — elevated behind player; crowd visible ahead
- **First-person** (`CAM_1P`): position `(0, 1.7, 0.1)`, target `(0, 1.7, −10)` — immersive crowd view

**Character pool (`CHAR_POOL`):** 10 Mixamo-sourced GLB characters — Ben, Leonard, Jody, Joe, James, Megan, Remy, Suzie, Kate, Louise. Users select their character via a picker UI backed by `CHAR_META` (name + emoji).

**Crowd system:** 18 clones (`CROWD_SIZE`) arranged on a circle of radius 5 metres (`CROWD_RADIUS`). Each clone plays an animation driven by its bracket from `crowdData`.

**GLB workflow:** Mixamo → FBX with skin → Blender import → export GLB (glTF Binary, Apply Modifiers on, Compression off). Animation clips are loaded separately per-action GLB and merged onto the character's mixer.

### Key animation bug fixes (for reference)
- **SkinnedMesh binding root**: `mixer.clipAction(clip)` must be called with **no second argument**. Passing `targetMesh` as the binding root causes PropertyBinding to search only the mesh's children for bones; Mixamo bones are siblings under the armature, not children of the mesh → characters explode to pieces.
- **SkeletonUtils.retargetClip bypass**: `THREE.SkeletonUtils.retargetClip` (r134) emits `.bones[name].quaternion` format tracks that require a SkinnedMesh as mixer root. Since the mixer is rooted at a Group, `SkeletonUtils.retargetClip` is bypassed entirely in favour of `_retargetClipForObject()`, which writes plain `boneName.quaternion` tracks resolvable via scene-graph walk.

---

## GLB Debug Tool (`docs/glb-debug.html`)

A standalone developer page (not served through Flask) used to validate character GLB exports.

- Loads all 11 characters (`ben`, `brian`, `james`, `jody`, `joe`, `kate`, `leonard`, `louise`, `megan`, `remy`, `suzie`) in individual Three.js viewports
- Detects export problems: missing skinned meshes, missing bones, no animation clips, invalid/extreme bounding-box height
- Renders a summary dashboard: models loaded, failed loads, suspicious exports, average height
- Provides toolbar buttons: Reload all, Toggle axes helpers, Toggle skeletons, Log diagnostics to console
- Uses Three.js r134 (CDN) with `GLTFLoader` and `OrbitControls`

---

## Key Design Decisions & Gotchas

1. **Mesa 3.0**: `model.agents` is an `AgentSet`, not a list. It supports iteration and `.select()` but NOT indexing. Use `agent.model.random.choice(agent.model.agents)` for random selection.
2. **Thread safety**: All model reads/writes are wrapped in `with model_lock:`.
3. **NumpyEncoder**: All API responses go through a custom JSON encoder that handles `np.ndarray`, `np.integer`, `np.floating`.
4. **Wealth floor**: If an agent cannot pay survival cost, their wealth is reset to `1`.
5. **Bracket thresholds** are recalculated each step from the live distribution — they are not fixed values.
6. **Comparison mode**: `current_model.comparison_models[policy]` holds the actual `WealthModel` instance per policy. `current_model.agents` is empty in comparison mode.
7. **Innovation Pareto distribution**: `np.random.pareto(2.5)` with values clamped to [1, 3]. Lower `alpha` = heavier tail = more inequality in innovation potential.
8. **Chart.js removed**: The frontend no longer loads Chart.js. `initializeCharts()` in `app.js` is a no-op guarded with `null` checks on canvas elements. Do not add chart canvas elements to the HTML without updating `app.js` accordingly.
9. **Person view is permanent**: `setView('person')` is called on construction and there is no UI to switch away. `refreshCharts()` always runs the person-view code path.
