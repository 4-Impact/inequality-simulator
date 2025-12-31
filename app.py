# tpike3/inequality-simulator/inequality-simulator-main/app.py

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

"""
# --- LLM / RAG Imports ---
import chromadb
from llama_index.core import VectorStoreIndex, Settings
from llama_index.vector_stores.chroma import ChromaVectorStore
from llama_index.embeddings.ollama import OllamaEmbedding
from llama_index.llms.ollama import Ollama
"""
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
#query_engine = None
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

"""
# --- RAG Initialization ---
def init_rag():
    Initializes the RAG engine using ChromaDB and Ollama
    global query_engine
    try:
        print("Initializing RAG Engine...")
        model_name = "nomic-embed-text:v1.5"
        Settings.embed_model = OllamaEmbedding(model_name=model_name)
        Settings.llm = Ollama(model="dolphin-llama3:8b", request_timeout=120.0)

        # Check in SLM folder or root
        db_path = "./SLM/chroma_db" if os.path.exists("./SLM/chroma_db") else "./chroma_db"
        print(f"Connecting to ChromaDB at {db_path}...")

        db = chromadb.PersistentClient(path=db_path)
        chroma_collection = db.get_or_create_collection("mesa_repo")
        vector_store = ChromaVectorStore(chroma_collection=chroma_collection)
        
        index = VectorStoreIndex.from_vector_store(vector_store=vector_store)
        
        # Robust System Prompt for Security & JSON
        system_prompt = (
            "You are a secure Policy Generation Assistant for a Mesa-based Agent simulation. "
            "Your goal is to interpret user policy ideas and convert them into executable Python code and Blockly definitions.\n\n"
            "### STRICT SECURITY RULES ###\n"
            "1. GENERATE ONLY PYTHON CODE. No bash, shell, or other languages.\n"
            "2. DO NOT use these modules: os, sys, subprocess, shutil, requests, urllib, eval, exec.\n"
            "3. Code must be a single class containing an `execute(self, agent)` method.\n\n"

            "### RESPONSE FORMAT ###\n"
            "You must return the response in strict JSON format. "
            "Do not write any conversational text before or after the JSON.\n"
            "Example format:\n"
            "{\n"
            '  "python_code": "class UniversalBasicIncome:\\n    def execute(self, agent):\\n        agent.wealth += 10",\n'
            '  "block_json": { "type": "universal_basic_income", "message0": "Universal Basic Income", "previousStatement": null, "nextStatement": null, "colour": 0, "tooltip": "Give everyone money" },\n'
            '  "block_generator": "Blockly.Python[\'universal_basic_income\'] = function(block) { return \'UniversalBasicIncome().execute(self)\\n\'; };"\n'
            "}\n\n"
            
            "### EXTREMELY IMPORTANT ###\n"
            "Your entire output must be a single valid JSON object. "
            "Do not wrap it in markdown blocks (like ```json). "
            "Start your response with '{' and end with '}'."
        )
    
        
        query_engine = index.as_query_engine(similarity_top_k=5, system_prompt=system_prompt)
        print("RAG Engine Loaded Successfully.")
    except Exception as e:
        print(f"Warning: Failed to load RAG Engine. Chat features will not work. Error: {e}")
"""

# --- Gemini Initialization ---
def init_gemini():
    """Initializes Google Gen AI Client"""
    global gemini_client
    api_key = os.environ.get("GOOGLE_API_KEY")
    
    if not api_key:
        print("WARNING: GOOGLE_API_KEY not found. Chat will not work.")
        return

    try:
        print("Initializing Google Gen AI Client...")
        # NEW SYNTAX: Create a client instead of global configure
        gemini_client = genai.Client(api_key=api_key)
        print("Gemini Client Loaded Successfully.")
    except Exception as e:
        print(f"Warning: Failed to load Gemini Client. Error: {e}")

# --- Helper to Reset Logic ---
def reset_logic_internal():
    """Resets user_logic.py, custom_policies.py, and user_blocks.js to default"""
    try:
        default_content = "HAS_CUSTOM_LOGIC = False\n\ndef step(self):\n    pass\n"
        with open(USER_LOGIC_FILE, 'w') as f:
            f.write(default_content)
        
        with open(CUSTOM_POLICIES_FILE, 'w') as f:
            f.write("# Custom user-generated policies will be appended here\n\n")

        # --- NEW: Reset user blocks file ---
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
    
    # Ensure Files Exist
    if not os.path.exists(CUSTOM_POLICIES_FILE):
        with open(CUSTOM_POLICIES_FILE, 'w') as f: f.write("# Init\n")
    if not os.path.exists(USER_BLOCKS_FILE):
        with open(USER_BLOCKS_FILE, 'w') as f: f.write("// Init\n")

    with model_lock:
        current_model = WealthModel()
        print("Default WealthModel initialized.")
    
    # Initialize Gemini
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

#----------------------------- START  DATA COLLECTION -------------------------------------#

@app.route('/api/data/wealth-distribution', methods=['GET'])
def get_wealth_distribution():
    global current_model
    if current_model is None: return jsonify({'error': 'Model not initialized'}), 400
    with model_lock:
        # Check for Comparison Mode
        if current_model.policy == "comparison":
            # Return the wealth lists from the results dictionary
            return json_response({
                policy: data['final_wealth'] 
                for policy, data in current_model.comparison_results.items()
            })
        else:
            # Single Model Mode
            wealth_vals = [agent.wealth for agent in current_model.agents]
            return json_response({'current': wealth_vals})

@app.route('/api/data/mobility', methods=['GET'])
def get_mobility_data():
    global current_model
    if current_model is None: return jsonify({'error': 'Model not initialized'}), 400
    with model_lock:
        if current_model.policy == "comparison":
            # Aggregate agent data from all sub-models
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
            # Single Model Mode
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
            # Return the historical lists for each policy
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
            # Return the historical lists for each policy
            return json_response({
                policy: data['total'] 
                for policy, data in current_model.comparison_results.items()
            })
        else:
            model_data = current_model.datacollector.get_model_vars_dataframe()
            total_data = model_data['Total'].tolist() if 'Total' in model_data.columns else []
            return json_response({'current': total_data})

#----------------------------- END DATA COLLECTION -------------------------------------#

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
            
        # Append the new block definition to the JS file
        with open(USER_BLOCKS_FILE, 'a') as f:
            f.write(f"\n// --- New Block: {block_json.get('type', 'unknown')} ---\n")
            # Write the block definition
            f.write(f"Blockly.defineBlocksWithJsonArray([{json.dumps(block_json)}]);\n")
            # Write the generator function
            f.write(f"{block_generator}\n")
            
        return jsonify({'status': 'success', 'message': 'Block definition saved.'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def sanitize_ai_response(json_text):
    """
    Scans the AI's JSON output for common Mesa 3.0 and Scope errors
    and fixes them automatically before sending to the frontend.
    """
    try:
        # 1. Clean Markdown wrappers if present
        clean_text = re.sub(r'^```json\s*|```\s*$', '', json_text.strip(), flags=re.MULTILINE)
        data = json.loads(clean_text)

        # --- FIX 1: Mesa 3.0 Compatibility (model.schedule.agents -> model.agents) ---
        if 'python_code' in data:
            if 'model.schedule.agents' in data['python_code']:
                print("LOG: Auto-fixing Mesa 3.0 'schedule.agents' error.")
                data['python_code'] = data['python_code'].replace('model.schedule.agents', 'model.agents')

        # --- FIX 2: Scope Error (model -> self.model) in Block Generator ---
        # The AI often writes ".execute(self, model)" but 'model' is undefined in user_logic.py
        if 'block_generator' in data:
            gen_code = data['block_generator']
            
            # Regex to find .execute(self, model) and turn it into .execute(self, self.model)
            # This looks for the pattern: .execute(self, model)
            if re.search(r'\.execute\(\s*self\s*,\s*model\s*\)', gen_code):
                print("LOG: Auto-fixing Scope error 'model' -> 'self.model'")
                data['block_generator'] = re.sub(
                    r'\.execute\(\s*self\s*,\s*model\s*\)', 
                    '.execute(self, self.model)', 
                    gen_code
                )

        return json.dumps(data)

    except Exception as e:
        print(f"Sanitization Warning: Could not parse/fix JSON: {e}")
        return json_text
    
@app.route('/api/chat', methods=['POST'])
def chat_endpoint():
    global gemini_client
    if gemini_client is None: return jsonify({'error': 'Gemini not initialized'}), 503
    try:
        data = request.get_json()
        user_query = data.get('message', '')
        
        # UPDATED PROMPT: Specific Rules for Mesa 3 & Scope
        prompt = (
            "You are a Policy Generator for a Mesa Agent simulation (Mesa 3.0+). "
            "Convert the user's idea into a Python class and a Blockly block definition.\n\n"
            
            "### CODING RULES (CRITICAL) ###\n"
            "1. **MESA 3.0 COMPATIBILITY**: `model.schedule.agents` DOES NOT EXIST. Use `model.agents` (it is a list).\n"
            "2. **SCOPE SAFETY**: This code runs inside `Agent.step(self)`. The variable `model` is NOT global. You MUST use `self.model`.\n"
            "3. **GENERATOR**: In the block generator, pass `self.model` to your class, not `model`. Ex: `MyPol().execute(self, self.model)`.\n\n"
            "4. **MODEL AND AGENT ATTRIBUTES**: Check ALL attributes added to the created policy blocks to MAKE SURE THEY EXIST, for example"
            "if the user says survival threshold the model attribute that agent would reference  would be self.model.survival_cost."

            "### BLOCK DEFINITION RULES ###\n"
            "1. Block must be an ACTION (Statement).\n"
            "2. JSON: `\"previousStatement\": null, \"nextStatement\": null`.\n"
            "3. GENERATOR SYNTAX: Use `Blockly.Python.forBlock['name'] = ...`.\n\n"
            
            "### OUTPUT FORMAT (Strict JSON) ###\n"
            "{\n"
            '  "python_code": "class MyPolicy:\\n    def execute(self, agent, model):\\n        # Use model.agents, NOT schedule.agents\\n        pass",\n'
            '  "block_json": { "type": "my_policy", "message0": "Execute My Policy", "previousStatement": null, "nextStatement": null, "colour": 0 },\n'
            '  "block_generator": "Blockly.Python.forBlock[\'my_policy\'] = function(block) { return \'MyPolicy().execute(self, self.model)\\n\'; };"\n'
            "}\n\n"
            f"User Idea: {user_query}"
        )
        
        response = gemini_client.models.generate_content(
            model='gemini-2.0-flash',
            contents=prompt,
            config=types.GenerateContentConfig(response_mime_type='application/json')
        )
        
        # Run the Auto-Fixer before sending back to user
        final_json = sanitize_ai_response(response.text)
        
        return jsonify({'response': final_json})

    except Exception as e:
        print(e)
        return jsonify({'error': str(e)}), 500