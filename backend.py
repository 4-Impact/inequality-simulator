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


@app.route('/api/initialize', methods=['POST'])
def initialize_model():
    """Initialize a new model with given parameters"""
    global current_model
    data = request.get_json()
    policy = data.get('policy', 'econophysics')
    population = data.get('population', 200)
    start_up_required = data.get('start_up_required', 1)
    
    with model_lock:
        current_model = WealthModel(
            policy=policy,
            population=population,
            start_up_required=start_up_required,
            seed=42
        )
        
        # Set default comparison steps for comparison models
        if policy == "comparison":
            current_model.set_comparison_steps(50)  # Default, will be updated when run is called
    
    return jsonify({'status': 'success', 'message': 'Model initialized'})

@app.route('/api/step', methods=['POST'])
def step_model():
    """Run one step of the model"""
    global current_model
    if current_model is None:
        return jsonify({'error': 'Model not initialized'}), 400
    
    data = request.get_json() or {}
    steps_for_comparison = data.get('comparison_steps', 50)
    
    with model_lock:
        # For comparison models, only set steps if not already set or if different
        if current_model.policy == "comparison":
            if not hasattr(current_model, 'comparison_steps') or current_model.comparison_steps != steps_for_comparison:
                current_model.set_comparison_steps(steps_for_comparison)
        
        current_model.step()
        current_model.datacollector.collect(current_model)
    
    return jsonify({'status': 'success'})

@app.route('/api/run', methods=['POST'])
def run_model():
    """Run the model for specified number of steps"""
    global current_model
    if current_model is None:
        return jsonify({'error': 'Model not initialized'}), 400
    
    data = request.get_json()
    steps = data.get('steps', 50)
    
    with model_lock:
        # Set comparison steps if this is for comparison mode
        if current_model.policy == "comparison":
            current_model.set_comparison_steps(steps)
        
        for _ in range(steps):
            current_model.step()
            current_model.datacollector.collect(current_model)
    
    return jsonify({'status': 'success', 'steps_run': steps})

@app.route('/api/data/wealth-distribution', methods=['GET'])
def get_wealth_distribution():
    """Get current wealth distribution data"""
    global current_model
    if current_model is None:
        return jsonify({'error': 'Model not initialized'}), 400
    
    with model_lock:
        if current_model.policy == "comparison" and hasattr(current_model, 'comparison_results') and current_model.comparison_results:
            # Return comparison data
            result = {}
            policies = ["econophysics", "powerful leaders", "equal wealth distribution", "innovation"]
            for policy in policies:
                if policy in current_model.comparison_results:
                    result[policy] = current_model.comparison_results[policy]['final_wealth']
            return json_response(result)
        else:
            # Return current model data
            wealth_vals = [agent.wealth for agent in current_model.agents]
            return json_response({'current': wealth_vals})

@app.route('/api/data/mobility', methods=['GET'])
def get_mobility_data():
    """Get mobility data for visualization"""
    global current_model
    if current_model is None:
        return jsonify({'error': 'Model not initialized'}), 400
    
    with model_lock:
        # For comparison mode, use data from the econophysics model as representative
        if current_model.policy == "comparison" and hasattr(current_model, 'comparison_models') and current_model.comparison_models:
            # Use the econophysics model for mobility visualization
            model_to_use = current_model.comparison_models.get('econophysics', current_model)
        else:
            model_to_use = current_model
            
        agents_data = []
        for agent in model_to_use.agents:
            agents_data.append({
                'bracket': agent.bracket,
                'mobility': agent.mobility,
                'wealth': agent.wealth
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
            # Return comparison data
            result = {}
            policies = ["econophysics", "powerful leaders", "equal wealth distribution", "innovation"]
            for policy in policies:
                if policy in current_model.comparison_results:
                    result[policy] = current_model.comparison_results[policy]['gini']
            return json_response(result)
        else:
            # Return current model data
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
            # Return comparison data
            result = {}
            policies = ["econophysics", "powerful leaders", "equal wealth distribution", "innovation"]
            for policy in policies:
                if policy in current_model.comparison_results:
                    result[policy] = current_model.comparison_results[policy]['total']
            return json_response(result)
        else:
            # Return current model data
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

if __name__ == '__main__':
    # Initialize with default model
    current_model = WealthModel()
    # Use environment port for production, fallback to 5000 for local
    import os
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=False, host='0.0.0.0', port=port)
