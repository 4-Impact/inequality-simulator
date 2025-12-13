"""
Flask backend API for the Inequality Simulator
Replaces Solara frontend with REST API endpoints
"""

from flask import Flask, jsonify, request, send_from_directory, Response
from flask_cors import CORS
import json
import numpy as np
from model import WealthModel, compute_gini, total_wealth
import threading
import time
import logging
import os
import re

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder='docs', static_url_path='')

# Configure CORS to allow GitHub Pages and other origins
CORS(app, origins=['*'])

# Global model instance
current_model = None
model_lock = threading.Lock()

class NumpyEncoder(json.JSONEncoder):
    """Custom JSON encoder for numpy arrays"""
    def default(self, obj):
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        return super().default(obj)

def json_response(data):
    """Helper function to return JSON response with custom encoder"""
    return Response(
        json.dumps(data, cls=NumpyEncoder),
        mimetype='application/json'
    )

# --- Helper to Reset Logic ---
def reset_logic_internal():
    """Internal function to reset user_logic.py to default"""
    try:
        default_content = "HAS_CUSTOM_LOGIC = False\n\ndef step(self):\n    pass\n"
        with open('user_logic.py', 'w') as f:
            f.write(default_content)
        logger.info("user_logic.py reset to default.")
        return True
    except Exception as e:
        logger.error(f"Failed to reset user_logic.py: {e}")
        return False

@app.route('/')
def landing():
    """Serve the landing page"""
    return send_from_directory('docs', 'index.html')

@app.route('/simulator')
def simulator():
    """Serve the main simulator page"""
    return send_from_directory('docs', 'landing.html')

@app.route('/<path:filename>')
def static_files(filename):
    """Serve static files (JS, CSS, etc.)"""
    return send_from_directory('docs', filename)

# --- Explanatory Animation Routes ---
@app.route('/explain/<name>')
def explain_template(name):
    """Serve the explanatory animation HTML files"""
    if name == 'econophysics':
        return send_from_directory('explanatory/templates', 'index.html')
    return send_from_directory('explanatory/templates', f'{name}.html')

@app.route('/css/<path:filename>')
def explain_css(filename):
    """Serve CSS for explanatory animations"""
    return send_from_directory('explanatory/static/css', filename)

@app.route('/js/<path:filename>')
def explain_js(filename):
    """Serve JS for explanatory animations"""
    return send_from_directory('explanatory/static/js', filename)

@app.route('/static/assets/<path:filename>')
def explain_assets(filename):
    """Serve 3D assets (FBX, etc) for explanatory animations"""
    return send_from_directory('explanatory/static/assets', filename)
# ------------------------------------


@app.route('/api/system_reset', methods=['POST'])
def system_reset():
    """Resets the entire system (logic + model state)"""
    # 1. Reset Logic File
    reset_logic_internal()
    
    # 2. Clear Model State
    global current_model
    with model_lock:
        current_model = None
        
    logger.info("System reset complete (Model cleared, Logic reset).")
    return jsonify({'status': 'success', 'message': 'System reset complete'})


@app.route('/api/initialize', methods=['POST'])
def initialize_model():
    """Initialize a new model with given parameters"""
    try:
        # Note: We removed the automatic reset here so users can restart 
        # the simulation without losing their custom code.
        # The reset happens on Server Start (run.py) or via Index Page (JS).

        global current_model
        data = request.get_json(silent=True) or {}

        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400

        policy = str(data.get('policy', 'econophysics'))
        population = int(data.get('population', 200))
        start_up_required = int(data.get('start_up_required', 1))
        patron = bool(data.get('patron', False))

        logger.info(
            "Initializing model with policy=%s, population=%s, start_up_required=%s, patron=%s",
            policy, population, start_up_required, patron
        )

        with model_lock:
            current_model = WealthModel(
                policy=policy,
                population=population,
                start_up_required=start_up_required,
                patron=patron,
                seed=42,
            )

        return jsonify({
            'status': 'initialized',
            'policy': policy,
            'population': population
        }), 200

    except (TypeError, ValueError) as e:
        logger.exception("Invalid parameters for initialize_model")
        return jsonify({'error': 'Invalid parameters', 'details': str(e)}), 400
    except Exception as e:
        logger.exception("Failed to initialize model")
        return jsonify({'error': 'Initialization failed', 'details': str(e)}), 500

@app.route('/api/step', methods=['POST'])
def step_model():
    """Run one step of the model"""
    global current_model
    if current_model is None:
        return jsonify({'error': 'Model not initialized'}), 400
    
    with model_lock:
        current_model.step()
        current_model.datacollector.collect(current_model)
    
    return jsonify({'status': 'success'})

@app.route('/api/data/wealth-distribution', methods=['GET'])
def get_wealth_distribution():
    """Get current wealth distribution data"""
    global current_model
    if current_model is None:
        return jsonify({'error': 'Model not initialized'}), 400
    
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
    """Get mobility data for visualization"""
    global current_model
    if current_model is None:
        return jsonify({'error': 'Model not initialized'}), 400
    
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
    """Get Gini coefficient data over time"""
    global current_model
    if current_model is None:
        return jsonify({'error': 'Model not initialized'}), 400
    
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
    """Get total wealth data over time"""
    global current_model
    if current_model is None:
        return jsonify({'error': 'Model not initialized'}), 400
    
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
    """Get current model status"""
    global current_model
    if current_model is None:
        return jsonify({'initialized': False})
    
    with model_lock:
        status = {
            'initialized': True,
            'policy': current_model.policy,
            'population': current_model.population,
            'step_count': getattr(current_model, 'comparison_step_count', 0) if current_model.policy == "comparison" else (current_model.schedule.steps if hasattr(current_model, 'schedule') else 0)
        }
        return json_response(status)

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint for Render"""
    return jsonify({'status': 'healthy', 'message': 'API is running'})

@app.route('/api', methods=['GET'])
def api_info():
    """API information endpoint"""
    return jsonify({
        'message': 'Inequality Simulator API',
        'version': '1.0',
        'endpoints': [
            '/api/health',
            '/api/status',
            '/api/initialize',
            '/api/step',
            '/api/data/wealth-distribution',
            '/api/data/mobility',
            '/api/data/gini',
            '/api/data/total-wealth'
        ]
    })

#-----------------BLOCKLY SECTION-------------------------------------------#
@app.route('/blockly/')
def blockly_home():
    """Serve the Blockly visualization page"""
    return send_from_directory('blockly', 'index.html')

@app.route('/blockly/<path:filename>')
def blockly_files(filename):
    """Serve static files for Blockly"""
    return send_from_directory('blockly', filename)

@app.route('/api/reset_code', methods=['POST'])
def reset_code():
    """Resets user_logic.py to default state (disabling it)"""
    if reset_logic_internal():
        return jsonify({'status': 'success', 'message': 'Logic reset to default.'})
    else:
        return jsonify({'error': 'Failed to reset logic'}), 500

@app.route('/api/update_code', methods=['POST'])
def update_code():
    """Receives Python code from Blockly and overwrites user_logic.py"""
    try:
        data = request.get_json()
        raw_code = data.get('code')
        
        # Inject the Active Flag = True
        file_content = "HAS_CUSTOM_LOGIC = True\n\nfrom policyblocks import *\nfrom utilities import *\n\n" + raw_code
        
        with open('user_logic.py', 'w') as f:
            f.write(file_content)
            
        return jsonify({'status': 'success', 'message': 'Logic updated!'})

    except Exception as e:
        logger.error(f"Failed to update code: {str(e)}")
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    try:
        # Initialize with default model
        current_model = WealthModel()
        logger.info("Default model initialized")
        
        # Reset logic on direct app.py start as well (just in case)
        reset_logic_internal()
        
        import os
        port = int(os.environ.get('PORT', 5000))
        logger.info(f"Starting server on port {port}")
        
        app.run(debug=False, use_reloader=False, host='0.0.0.0', port=port)
    except Exception as e:
        logger.error(f"Failed to start server: {str(e)}")
        raise