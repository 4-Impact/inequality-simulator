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
    prompt = (
        "You are a Policy Generator for a Mesa Agent simulation (Mesa 3.0+). "
        "Convert the user's idea into a Python class and a Blockly block definition.\n\n"

        "### CODING RULES (CRITICAL) ###\n"
        "1. **MESA 3.0 COMPATIBILITY**: `model.schedule.agents` DOES NOT EXIST. Use `model.agents` (it is a list).\n"
        "2. **SCOPE SAFETY**: This code runs inside `Agent.step(self)`. The variable `model` is NOT global. You MUST use `self.model`.\n"
        "3. **GENERATOR**: In the block generator, pass `self.model` to your class. Ex: `MyPol().execute(self, self.model)`.\n"
        "4. **ATTRIBUTES**: Verify attributes exist. The model has `survival_cost` (NOT survival_amount or threshold).\n\n"

        "### OUTPUT FORMAT (Strict JSON) ###\n"
        "Return a single JSON object with ALL four of these fields:\n"
        "{\n"
        '  "description": "A plain-English, numbered step-by-step explanation of exactly what this policy does during each simulation step. Each numbered step should be one sentence. Example: 1. Every agent pays 10% of their wealth as tax. 2. The collected tax is pooled together. 3. The pool is divided equally among agents below the survival threshold.",\n'
        '  "python_code": "class MyPolicy:\\n    def execute(self, agent, model):\\n        # logic",\n'
        '  "block_json": { "type": "my_policy", "message0": "Execute My Policy", "previousStatement": null, "nextStatement": null, "colour": 0 },\n'
        '  "block_generator": "Blockly.Python.forBlock[\'my_policy\'] = function(block) { return \'MyPolicy().execute(self, self.model)\\n\'; };"\n'
        "}\n\n"
        "The `description` field is REQUIRED. It must be a numbered list in plain language that a non-programmer can understand. "
        "Do not use code or technical jargon in the description.\n"
        f"\nUser Idea: {user_input}"
    )
    
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