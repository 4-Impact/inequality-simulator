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
| Frontend | Vanilla HTML / CSS / JavaScript (Chart.js for visualisations) |
| Custom policy UI | [Blockly](https://developers.google.com/blockly) (visual programming blocks) |
| Maths/stats | NumPy, SciPy |
| Config | `python-dotenv`, `GOOGLE_API_KEY` env var |
| Entry point | `run.py` → starts Flask on port 5000 |

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
│   └── app.js           # Frontend JavaScript
└── explanatory/         # Static explainer pages for each policy
    ├── templates/        # HTML templates (econophysics, capitalism, communism, fascism)
    └── static/           # CSS and JS for explainer animations
```

---

## Simulation Model (`model.py`)

### `WealthModel(mesa.Model)`

**Constructor parameters:**
- `policy` (str, default `"econophysics"`) — which economic policy to run
- `population` (int, default `200`) — number of agents
- `start_up_required` (int 1–3, default `1`) — capital barrier to innovation (used by capitalism policy)
- `patron` (bool, default `False`) — enables patron/client dynamics
- `seed` (int, default `42`)

**Key attributes:**
- `self.policy` — active policy string
- `self.agents` — Mesa AgentSet (Mesa 3.0: do NOT use `model.schedule.agents`)
- `self.brackets` — `[lower_threshold, upper_threshold]` for wealth class bands
- `self.survival_cost` — flat cost paid each step (default `1`)
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

### `Fascism`
- Party elites (top 5% by W) collect a 20% tax from non-elite agents each step
- Non-elites still participate in `WealthExchange` afterwards

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

## Key Design Decisions & Gotchas

1. **Mesa 3.0**: `model.agents` is an `AgentSet`, not a list. It supports iteration and `.select()` but NOT indexing. Use `agent.model.random.choice(agent.model.agents)` for random selection.
2. **Thread safety**: All model reads/writes are wrapped in `with model_lock:`.
3. **NumpyEncoder**: All API responses go through a custom JSON encoder that handles `np.ndarray`, `np.integer`, `np.floating`.
4. **Wealth floor**: If an agent cannot pay survival cost, their wealth is reset to `1`.
5. **Bracket thresholds** are recalculated each step from the live distribution — they are not fixed values.
6. **Comparison mode**: `current_model.comparison_models[policy]` holds the actual `WealthModel` instance per policy. `current_model.agents` is empty in comparison mode.
7. **Innovation Pareto distribution**: `np.random.pareto(2.5)` with values clamped to [1, 3]. Lower `alpha` = heavier tail = more inequality in innovation potential.
