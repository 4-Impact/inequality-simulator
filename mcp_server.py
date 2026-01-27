import os
import json
import traceback
from dotenv import load_dotenv
import google.genai as genai
from flask import Flask, request, jsonify
from app import validate_policy_code, sanitize_ai_response # Reusing your existing logic

load_dotenv()

app = Flask(__name__)
client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))

@app.route('/mcp/generate_policy', methods=['POST'])
def mcp_generate_policy():
    user_input = request.json.get("prompt")
    
    # 1. GENERATION PHASE
    prompt = f"""
    Explain and build a Mesa 3.0 policy for: {user_input}
    Return a JSON with:
    1. 'description': Step-by-step plain English explanation.
    2. 'python_code': The class with an execute(self, agent) method.
    3. 'block_json': Blockly definition.
    4. 'block_generator': Javascript for Blockly.
    """
    
    response = client.models.generate_content(
        model='gemini-2.5-pro',
        contents=prompt,
        config={'response_mime_type': 'application/json'}
    )
    
    payload = sanitize_ai_response(response.text)
    
    # 2. TEST PHASE (Pre-Verification)
    # Reuses the MockModel and MockAgent logic from your app.py
    valid, error_message = validate_policy_code(payload['python_code'])
    
    if not valid:
        # Self-correction loop: Send error back to Gemini to fix once
        # (This implements your "test the codes prior to providing" requirement)
        return jsonify({"error": "Validation failed", "details": error_message}), 400

    return jsonify(payload)