from flask import Flask, jsonify, request, send_from_directory, Response
from flask_cors import CORS
import json
import numpy as np
import threading
import time
import logging
import os
import sys
import re
import traceback

from dotenv import load_dotenv
load_dotenv()

import google.genai as genai
from google.genai import types

# --- Model Imports ---
from model import WealthModel, compute_gini, total_wealth

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder='docs', static_url_path='')
CORS(app, origins=['*'])

# --- Global State ---
current_model = None
model_lock = threading.Lock()
gemini_client = None

# --- Constants ---
CUSTOM_POLICIES_FILE = 'custom_policies.py'
USER_LOGIC_FILE = 'user_logic.py'
USER_BLOCKS_FILE = 'blockly/user_blocks.js'

class NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.ndarray): return obj.tolist()
        if isinstance(obj, np.integer): return int(obj)
        if isinstance(obj, np.floating): return float(obj)
        return super().default(obj)

def json_response(data):
    return Response(json.dumps(data, cls=NumpyEncoder), mimetype='application/json')

# --- Gemini Initialization ---
def init_gemini():
    """Initializes Google Gen AI Client"""
    global gemini_client
    api_key = os.environ.get("GOOGLE_API_KEY")
    
    if not api_key:
        logging.warning("GOOGLE_API_KEY not found. Chat will not work.")
        return

    try:
        logging.info("Initializing Google Gen AI Client...")
        gemini_client = genai.Client(api_key=api_key)
        logging.info("Gemini Client Loaded Successfully.")
    except Exception as e:
        logging.exception(f"Warning: Failed to load Gemini Client. Error: {e}")

# --- Helper to Reset Logic ---
def reset_logic_internal():
    """Resets user_logic.py, custom_policies.py, and user_blocks.js to default"""
    try:
        default_content = "HAS_CUSTOM_LOGIC = False\n\ndef step(self):\n    pass\n"
        with open(USER_LOGIC_FILE, 'w') as f:
            f.write(default_content)
        
        with open(CUSTOM_POLICIES_FILE, 'w') as f:
            f.write("# Custom user-generated policies will be appended here\n\n")

        with open(USER_BLOCKS_FILE, 'w') as f:
            f.write("// User generated blocks will be saved here\n\n")
            
        logger.info("Logic, Custom Policies, and User Blocks reset to default.")
        return True
    except Exception as e:
        logger.error(f"Failed to reset logic: {e}")
        return False

# --- Simulation Setup Function ---
def setup_simulation():
    """Forces a clean state for the simulation on startup"""
    global current_model
    
    print("--- PERFORMING SYSTEM RESET ---")
    reset_logic_internal()
    
    if not os.path.exists(CUSTOM_POLICIES_FILE):
        with open(CUSTOM_POLICIES_FILE, 'w') as f: f.write("# Init\n")
    if not os.path.exists(USER_BLOCKS_FILE):
        with open(USER_BLOCKS_FILE, 'w') as f: f.write("// Init\n")

    with model_lock:
        current_model = WealthModel()
        print("Default WealthModel initialized.")
    
    init_gemini()

# --- Standard Routes ---
@app.route('/')
def landing(): return send_from_directory('docs', 'index.html')

@app.route('/simulator')
def simulator(): return send_from_directory('docs', 'landing.html')

@app.route('/<path:filename>')
def static_files(filename): return send_from_directory('docs', filename)

@app.route('/blockly/')
def blockly_home(): return send_from_directory('blockly', 'index.html')

@app.route('/blockly/<path:filename>')
def blockly_files(filename): return send_from_directory('blockly', filename)

@app.route('/explain/<name>')
def explain_template(name):
    if name == 'econophysics': return send_from_directory('explanatory/templates', 'index.html')
    return send_from_directory('explanatory/templates', f'{name}.html')

@app.route('/css/<path:filename>')
def explain_css(filename): return send_from_directory('explanatory/static/css', filename)

@app.route('/js/<path:filename>')
def explain_js(filename): return send_from_directory('explanatory/static/js', filename)

@app.route('/static/assets/<path:filename>')
def explain_assets(filename): return send_from_directory('explanatory/static/assets', filename)

# --- API Endpoints ---
@app.route('/api/system_reset', methods=['POST'])
def system_reset():
    reset_logic_internal()
    global current_model
    with model_lock:
        current_model = None
    return jsonify({'status': 'success', 'message': 'System reset complete'})

@app.route('/api/initialize', methods=['POST'])
def initialize_model():
    global current_model
    data = request.get_json(silent=True) or {}
    policy = str(data.get('policy', 'econophysics'))
    population = int(data.get('population', 200))
    start_up_required = int(data.get('start_up_required', 1))
    patron = bool(data.get('patron', False))

    with model_lock:
        current_model = WealthModel(
            policy=policy,
            population=population,
            start_up_required=start_up_required,
            patron=patron,
            seed=42,
        )
    return jsonify({'status': 'initialized', 'policy': policy}), 200

@app.route('/api/step', methods=['POST'])
def step_model():
    global current_model
    if current_model is None: return jsonify({'error': 'Model not initialized'}), 400
    with model_lock:
        current_model.step()
        current_model.datacollector.collect(current_model)
    return jsonify({'status': 'success'})

@app.route('/api/data/wealth-distribution', methods=['GET'])
def get_wealth_distribution():
    global current_model
    if current_model is None: return jsonify({'error': 'Model not initialized'}), 400
    with model_lock:
        if current_model.policy == "comparison":
            return json_response({
                policy: data['final_wealth'] 
                for policy, data in current_model.comparison_results.items()
            })
        else:
            wealth_vals = [agent.wealth for agent in current_model.agents]
            return json_response({'current': wealth_vals})

@app.route('/api/data/mobility', methods=['GET'])
def get_mobility_data():
    global current_model
    if current_model is None: return jsonify({'error': 'Model not initialized'}), 400
    with model_lock:
        if current_model.policy == "comparison":
            comparison_data = {}
            for policy, sub_model in current_model.comparison_models.items():
                agents_data = []
                for agent in sub_model.agents:
                    agents_data.append({
                        'bracket': agent.bracket,
                        'mobility': agent.mobility,
                        'wealth': agent.wealth,
                        'policy': policy
                    })
                comparison_data[policy] = agents_data
            return json_response(comparison_data)
        else:
            agents_data = []
            for agent in current_model.agents:
                agents_data.append({
                    'bracket': agent.bracket,
                    'mobility': agent.mobility,
                    'wealth': agent.wealth,
                    'policy': current_model.policy
                })
            return json_response(agents_data)

@app.route('/api/data/gini', methods=['GET'])
def get_gini_data():
    global current_model
    if current_model is None: return jsonify({'error': 'Model not initialized'}), 400
    with model_lock:
        if current_model.policy == "comparison":
            return json_response({
                policy: data['gini'] 
                for policy, data in current_model.comparison_results.items()
            })
        else:
            model_data = current_model.datacollector.get_model_vars_dataframe()
            gini_data = model_data['Gini'].tolist() if 'Gini' in model_data.columns else []
            return json_response({'current': gini_data})

@app.route('/api/data/total-wealth', methods=['GET'])
def get_total_wealth_data():
    global current_model
    if current_model is None: return jsonify({'error': 'Model not initialized'}), 400
    with model_lock:
        if current_model.policy == "comparison":
            return json_response({
                policy: data['total'] 
                for policy, data in current_model.comparison_results.items()
            })
        else:
            model_data = current_model.datacollector.get_model_vars_dataframe()
            total_data = model_data['Total'].tolist() if 'Total' in model_data.columns else []
            return json_response({'current': total_data})

@app.route('/api/status', methods=['GET'])
def get_status():
    global current_model
    if current_model is None: return jsonify({'initialized': False})
    with model_lock:
        return json_response({'initialized': True, 'policy': current_model.policy})

@app.route('/api/reset_code', methods=['POST'])
def reset_code():
    if reset_logic_internal():
        return jsonify({'status': 'success', 'message': 'Logic reset to default.'})
    return jsonify({'error': 'Failed to reset logic'}), 500

@app.route('/api/add_custom_policy', methods=['POST'])
def add_custom_policy():
    try:
        data = request.get_json()
        python_code = data.get('code', '')
        if not python_code: return jsonify({'error': 'No code provided'}), 400
        with open(CUSTOM_POLICIES_FILE, 'a') as f:
            f.write("\n\n" + python_code + "\n")
        return jsonify({'status': 'success', 'message': 'Policy added.'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/update_code', methods=['POST'])
def update_code():
    try:
        data = request.get_json()
        raw_code = data.get('code')
        file_content = (
            "HAS_CUSTOM_LOGIC = True\n\n"
            "from policyblocks import *\n"
            "from utilities import *\n"
            "try:\n    from custom_policies import *\nexcept ImportError:\n    pass\n\n" + raw_code
        )
        with open(USER_LOGIC_FILE, 'w') as f:
            f.write(file_content)
        return jsonify({'status': 'success', 'message': 'Logic updated!'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
@app.route('/api/save_block_definition', methods=['POST'])
def save_block_definition():
    try:
        data = request.get_json()
        block_json = data.get('block_json')
        block_generator = data.get('block_generator')
        
        if not block_json or not block_generator:
            return jsonify({'error': 'Missing block definition'}), 400
            
        with open(USER_BLOCKS_FILE, 'a') as f:
            f.write(f"\n// --- New Block: {block_json.get('type', 'unknown')} ---\n")
            f.write(f"Blockly.defineBlocksWithJsonArray([{json.dumps(block_json)}]);\n")
            f.write(f"{block_generator}\n")
            
        return jsonify({'status': 'success', 'message': 'Block definition saved.'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# --- VALIDATION LOGIC ---
class MockModel:
    def __init__(self):
        # Match attributes from WealthModel in model.py
        self.agents = []
        self.survival_cost = 1.0
        self.policy = "custom"
        self.population = 10
        self.brackets = [10, 20]
        self.start_up_required = 1
        self.patron = False
        self.total = 1000.0
        self.comparison_results = {}
        # Mock DataCollector
        self.datacollector = type('MockDataCollector', (), {'collect': lambda s, m: None})()

class MockAgent:
    def __init__(self, model):
        # Match attributes from WealthAgent
        self.wealth = 10.0
        self.W = 0.2
        self.I = 1.0 # Innovation
        self.model = model
        self.unique_id = 1
        self.bracket = "Middle"
        self.bracket_history = []
        self.party_elite = False
        self.mobility = 0

def validate_policy_code(code_str):
    """
    Tries to compile and execute the generated code in a mock environment.
    Returns (success: bool, message: str)
    """
    try:
        # 1. Syntax Check
        compile(code_str, '<string>', 'exec')
        
        # 2. Runtime Check (Safe Execution)
        local_scope = {}
        exec(code_str, {'np': np, 'random': np.random}, local_scope)
        
        # Find the class definition
        policy_class = None
        for name, val in local_scope.items():
            if isinstance(val, type):
                policy_class = val
                break
        
        if not policy_class:
            return False, "Code executed but no class definition was found."

        # 3. Execution Check
        mock_model = MockModel()
        mock_agent = MockAgent(mock_model)
        mock_model.agents.append(mock_agent)
        
        instance = policy_class()
        
        # Try running it
        if not hasattr(instance, 'execute'):
            return False, f"Class '{policy_class.__name__}' missing 'execute' method."
            
        try:
            instance.execute(mock_agent, mock_model)
        except TypeError:
            instance.execute(mock_agent)
            
        return True, "Verified: Code compiled and ran successfully in test environment."
        
    except Exception as e:
        tb = traceback.format_exc()
        
        # --- IMPROVED ERROR REPORTING FOR AI ---
        # If it's an attribute error, list what IS available so the AI can fix it.
        error_msg = f"{type(e).__name__}: {str(e)}"
        
        if isinstance(e, AttributeError):
            # Create fresh mocks to inspect attributes
            m_attrs = [k for k in MockModel().__dict__.keys() if not k.startswith('_')]
            a_attrs = [k for k in MockAgent(MockModel()).__dict__.keys() if not k.startswith('_')]
            
            error_msg += f"\n[HINT] Available Model attributes: {m_attrs}"
            error_msg += f"\n[HINT] Available Agent attributes: {a_attrs}"
            error_msg += "\nPlease check your variable names."

        return False, error_msg

def sanitize_ai_response(json_text):
    try:
        clean_text = re.sub(r'^```json\s*|```\s*$', '', json_text.strip(), flags=re.MULTILINE)
        data = json.loads(clean_text)
        
        if 'python_code' in data:
            if 'model.schedule.agents' in data['python_code']:
                data['python_code'] = data['python_code'].replace('model.schedule.agents', 'model.agents')

        if 'block_generator' in data:
            gen_code = data['block_generator']
            if re.search(r'\.execute\(\s*self\s*,\s*model\s*\)', gen_code):
                data['block_generator'] = re.sub(
                    r'\.execute\(\s*self\s*,\s*model\s*\)', 
                    '.execute(self, self.model)', 
                    gen_code
                )
        return data
    except Exception as e:
        print(f"Sanitization Warning: {e}")
        return None

@app.route('/api/chat', methods=['POST'])
def chat_endpoint():
    global gemini_client
    if gemini_client is None: 
        try: 
            logging.info("Initializing Gemini")
            init_gemini()
        except: 
            return jsonify({'error': 'Gemini not initialized'}), 503
    
    data = request.get_json()
    user_query = data.get('message', '')
    
    # SYSTEM PROMPT
    base_prompt = (
        "You are a Policy Generator for a Mesa Agent simulation (Mesa 3.0+). "
        "Convert the user's idea into a Python class and a Blockly block definition.\n\n"
        
        "### CODING RULES (CRITICAL) ###\n"
        "1. **MESA 3.0 COMPATIBILITY**: `model.schedule.agents` DOES NOT EXIST. Use `model.agents` (it is a list).\n"
        "2. **SCOPE SAFETY**: This code runs inside `Agent.step(self)`. The variable `model` is NOT global. You MUST use `self.model`.\n"
        "3. **GENERATOR**: In the block generator, pass `self.model` to your class. Ex: `MyPol().execute(self, self.model)`.\n\n"
        "4. **ATTRIBUTES**: Verify attributes exist. The model has `survival_cost` (NOT survival_amount or threshold).\n\n"
        
        "### OUTPUT FORMAT (Strict JSON) ###\n"
        "{\n"
        '  "python_code": "class MyPolicy:\\n    def execute(self, agent, model):\\n        # logic",\n'
        '  "block_json": { "type": "my_policy", "message0": "Execute My Policy", "previousStatement": null, "nextStatement": null, "colour": 0 },\n'
        '  "block_generator": "Blockly.Python.forBlock[\'my_policy\'] = function(block) { return \'MyPolicy().execute(self, self.model)\\n\'; };"\n'
        "}\n"
    )

    current_prompt = base_prompt + f"\nUser Idea: {user_query}"
    
    max_retries = 3
    status_log = []
    final_response = None
    
    for attempt in range(max_retries):
        status_log.append(f"Phase 1 (Attempt {attempt+1}): Generating Code...")
        try:
            response = gemini_client.models.generate_content(
                model='gemini-2.0-flash',
                contents=current_prompt,
                config=types.GenerateContentConfig(response_mime_type='application/json')
            )
            
            # 1. Parse & Sanitize
            json_data = sanitize_ai_response(response.text)
            if not json_data:
                raise ValueError("Failed to parse JSON response")
            
            # 2. Test Code
            status_log.append(f"Phase 2 (Attempt {attempt+1}): Testing Code...")
            valid, message = validate_policy_code(json_data['python_code'])
            
            if valid:
                status_log.append("Phase 2: Success! Code verified.")
                json_data['status_message'] = f"✅ Success! (Attempt {attempt+1})\n" + "\n".join(status_log)
                final_response = json_data
                break
            else:
                status_log.append(f"Phase 2 Failed: {message}")
                # Feedback loop: Add error to prompt and retry
                current_prompt += f"\n\nPREVIOUS ATTEMPT FAILED VALIDATION:\nCode:\n{json_data['python_code']}\nError:\n{message}\n\nPlease fix the code and return the JSON again."
        
        except Exception as e:
            status_log.append(f"Error in attempt {attempt+1}: {str(e)}")
            time.sleep(1) 

    if final_response:
        return jsonify({'response': json.dumps(final_response)})
    else:
        return jsonify({'error': "Failed to generate valid code after 3 attempts.\nLogs:\n" + "\n".join(status_log)}), 500

if __name__ == "__main__":
    setup_simulation()
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=False, host='0.0.0.0', port=port)