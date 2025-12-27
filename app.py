"""
Flask backend API for the Inequality Simulator
Replaces Solara frontend with REST API endpoints
Includes SLM/LLM Integration for Dynamic Policy Generation
"""

from flask import Flask, jsonify, request, send_from_directory, Response
from flask_cors import CORS
import json
import numpy as np
import threading
import time
import logging
import os
import sys

# --- LLM / RAG Imports ---
import chromadb
from llama_index.core import VectorStoreIndex, StorageContext, Settings
from llama_index.vector_stores.chroma import ChromaVectorStore
from llama_index.embeddings.ollama import OllamaEmbedding
from llama_index.llms.ollama import Ollama

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
query_engine = None # Initialized on startup

# --- Constants ---
CUSTOM_POLICIES_FILE = 'custom_policies.py'
USER_LOGIC_FILE = 'user_logic.py'

class NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.ndarray): return obj.tolist()
        if isinstance(obj, np.integer): return int(obj)
        if isinstance(obj, np.floating): return float(obj)
        return super().default(obj)

def json_response(data):
    return Response(json.dumps(data, cls=NumpyEncoder), mimetype='application/json')

# --- RAG Initialization ---
def init_rag():
    """Initializes the RAG engine using ChromaDB and Ollama"""
    global query_engine
    try:
        print("Initializing RAG Engine...")
        model_name = "nomic-embed-text:v1.5"
        Settings.embed_model = OllamaEmbedding(model_name=model_name)
        Settings.llm = Ollama(model="dolphin-llama3:8b", request_timeout=120.0)

        db = chromadb.PersistentClient(path="./chroma_db")
        chroma_collection = db.get_or_create_collection("mesa_repo")
        vector_store = ChromaVectorStore(chroma_collection=chroma_collection)
        
        # Load index from existing vector store
        index = VectorStoreIndex.from_vector_store(
            vector_store=vector_store,
        )
        
        # System prompt to guide the output format
        system_prompt = (
            "You are a policy assistant for a Python Mesa wealth inequality simulation. "
            "When asked to create a policy, you MUST return a JSON object with 3 fields: "
            "1. 'python_code': The Python class code (e.g., class MyPolicy: def execute(self, agent): ...). "
            "2. 'block_json': The Blockly JSON definition. "
            "3. 'block_generator': The Blockly Python generator JavaScript code. "
            "Ensure the Python class uses 'agent.wealth' and 'agent.model' correctly based on the provided context."
        )
        
        query_engine = index.as_query_engine(
            similarity_top_k=5,
            system_prompt=system_prompt
        )
        print("RAG Engine Loaded Successfully.")
    except Exception as e:
        print(f"Warning: Failed to load RAG Engine. Chat features will not work. Error: {e}")

# --- Helper to Reset Logic ---
def reset_logic_internal():
    """Resets user_logic.py and custom_policies.py to default"""
    try:
        # Reset Logic
        default_content = "HAS_CUSTOM_LOGIC = False\n\ndef step(self):\n    pass\n"
        with open(USER_LOGIC_FILE, 'w') as f:
            f.write(default_content)
        
        # Reset Custom Policies
        with open(CUSTOM_POLICIES_FILE, 'w') as f:
            f.write("# Custom user-generated policies will be appended here\n\n")
            
        logger.info("Logic and Custom Policies reset to default.")
        return True
    except Exception as e:
        logger.error(f"Failed to reset logic: {e}")
        return False

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

# --- Explanation Routes ---
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
    return jsonify({'status': 'initialized', 'policy': policy, 'population': population}), 200

@app.route('/api/step', methods=['POST'])
def step_model():
    global current_model
    if current_model is None: return jsonify({'error': 'Model not initialized'}), 400
    with model_lock:
        current_model.step()
        current_model.datacollector.collect(current_model)
    return jsonify({'status': 'success'})

# --- Data Routes (Wealth, Mobility, Gini, Total) ---
@app.route('/api/data/wealth-distribution', methods=['GET'])
def get_wealth_distribution():
    global current_model
    if current_model is None: return jsonify({'error': 'Model not initialized'}), 400
    with model_lock:
        if current_model.policy == "comparison" and hasattr(current_model, 'comparison_results') and current_model.comparison_results:
            result = {}
            policies = ["econophysics", "fascism", "communism", "capitalism"]
            for policy in policies:
                if policy in current_model.comparison_results:
                    result[policy] = current_model.comparison_results[policy]['final_wealth']
            return json_response(result)
        else:
            wealth_vals = [agent.wealth for agent in current_model.agents]
            return json_response({'current': wealth_vals})

@app.route('/api/data/mobility', methods=['GET'])
def get_mobility_data():
    global current_model
    if current_model is None: return jsonify({'error': 'Model not initialized'}), 400
    with model_lock:
        if current_model.policy == "comparison" and hasattr(current_model, 'comparison_models') and current_model.comparison_models:
            comparison_data = {}
            policies = ["econophysics", "fascism", "communism", "capitalism"]
            
            for policy in policies:
                if policy in current_model.comparison_models:
                    model = current_model.comparison_models[policy]
                    agents_data = []
                    for agent in model.agents:
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
        if current_model.policy == "comparison" and hasattr(current_model, 'comparison_results') and current_model.comparison_results:
            result = {}
            policies = ["econophysics", "fascism", "communism", "capitalism"]
            for policy in policies:
                if policy in current_model.comparison_results:
                    result[policy] = current_model.comparison_results[policy]['gini']
            return json_response(result)
        else:
            model_data = current_model.datacollector.get_model_vars_dataframe()
            if 'Gini' in model_data.columns:
                gini_data = model_data['Gini'].tolist()
            else:
                gini_data = []
            return json_response({'current': gini_data})

@app.route('/api/data/total-wealth', methods=['GET'])
def get_total_wealth_data():
    global current_model
    if current_model is None: return jsonify({'error': 'Model not initialized'}), 400
    with model_lock:
        if current_model.policy == "comparison" and hasattr(current_model, 'comparison_results') and current_model.comparison_results:
            result = {}
            policies = ["econophysics", "fascism", "communism", "capitalism"]
            for policy in policies:
                if policy in current_model.comparison_results:
                    result[policy] = current_model.comparison_results[policy]['total']
            return json_response(result)
        else:
            model_data = current_model.datacollector.get_model_vars_dataframe()
            if 'Total' in model_data.columns:
                total_data = model_data['Total'].tolist()
            else:
                total_data = []
            return json_response({'current': total_data})

@app.route('/api/status', methods=['GET'])
def get_status():
    global current_model
    if current_model is None: return jsonify({'initialized': False})
    with model_lock:
        return json_response({
            'initialized': True, 
            'policy': current_model.policy, 
            'population': current_model.population
        })

# --- Logic & Chat API ---

@app.route('/api/reset_code', methods=['POST'])
def reset_code():
    if reset_logic_internal():
        return jsonify({'status': 'success', 'message': 'Logic reset to default.'})
    return jsonify({'error': 'Failed to reset logic'}), 500

@app.route('/api/add_custom_policy', methods=['POST'])
def add_custom_policy():
    """Appends a new Python class to custom_policies.py"""
    try:
        data = request.get_json()
        python_code = data.get('code', '')
        
        if not python_code:
            return jsonify({'error': 'No code provided'}), 400

        with open(CUSTOM_POLICIES_FILE, 'a') as f:
            f.write("\n\n" + python_code + "\n")
            
        return jsonify({'status': 'success', 'message': 'Policy added to backend registry.'})
    except Exception as e:
        logger.error(f"Failed to add custom policy: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/update_code', methods=['POST'])
def update_code():
    """Updates user_logic.py with the new step function + imports custom policies"""
    try:
        data = request.get_json()
        raw_code = data.get('code')
        
        # Inject Custom Policies Import
        file_content = (
            "HAS_CUSTOM_LOGIC = True\n\n"
            "from policyblocks import *\n"
            "from utilities import *\n"
            "try:\n"
            "    from custom_policies import *\n"
            "except ImportError:\n"
            "    pass\n\n" + raw_code
        )
        
        with open(USER_LOGIC_FILE, 'w') as f:
            f.write(file_content)
            
        return jsonify({'status': 'success', 'message': 'Logic updated!'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/chat', methods=['POST'])
def chat_endpoint():
    """Chat endpoint for the SLM"""
    global query_engine
    if query_engine is None:
        return jsonify({'error': 'RAG Engine not initialized'}), 503
        
    try:
        data = request.get_json()
        user_query = data.get('message', '')
        
        # Append specific instruction to ensure JSON output
        full_query = (
            user_query + 
            " Generate a complete Python class for this policy, the Blockly JSON definition, "
            "and the Blockly Python generator code. Format the response as valid JSON."
        )
        
        response = query_engine.query(full_query)
        return jsonify({'response': str(response)})
    except Exception as e:
        logger.error(f"Chat error: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # Initialize RAG before server start
    init_rag()
    
    # Ensure custom policies file exists
    if not os.path.exists(CUSTOM_POLICIES_FILE):
        with open(CUSTOM_POLICIES_FILE, 'w') as f:
            f.write("# Custom user-generated policies will be appended here\n\n")

    current_model = WealthModel()
    reset_logic_internal()
    
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=False, use_reloader=False, host='0.0.0.0', port=port)