// tpike3/inequality-simulator/inequality-simulator-main/blockly/custom_blocks.js

// 1. Define the color scheme
const BLOCK_COLOR_AGENT = 120;
const BLOCK_COLOR_POLICY = 0;
const BLOCK_COLOR_LOGIC = 210;
const BLOCK_COLOR_ROOT  = 230;

// 2. Define the Visual Blocks (JSON)
Blockly.defineBlocksWithJsonArray([
  // ── POLICY ROOT ──────────────────────────────────────────────────────────
  // This is the top-level block that represents the currently active policy.
  // The user drops exactly ONE policy block into the POLICY slot. Whatever
  // block label sits here becomes the active policy name on the frontend.
  {
    "type": "policy_root",
    "message0": "Active Policy %1",
    "args0": [
      { "type": "input_statement", "name": "POLICY", "check": "Policy" }
    ],
    "message1": "Then run agent logic %1",
    "args1": [
      { "type": "input_statement", "name": "STEPS" }
    ],
    "colour": BLOCK_COLOR_ROOT,
    "tooltip": "Drop exactly one policy block into the 'Active Policy' slot to set the policy the simulator uses. The block label becomes the policy name on the frontend."
  },

  // --- AGENT BLOCKS ---
  {
    "type": "agent_step_def",
    "message0": "Agent Step (Individual Logic) %1 %2",
    "args0": [
      { "type": "input_dummy" },
      { "type": "input_statement", "name": "STEPS" }
    ],
    "previousStatement": null,
    "nextStatement": null,
    "colour": BLOCK_COLOR_AGENT,
    "tooltip": "The logic running inside every agent per turn"
  },
  {
    "type": "update_history",
    "message0": "Update Bracket History",
    "previousStatement": null,
    "nextStatement": null,
    "colour": BLOCK_COLOR_AGENT,
    "tooltip": "Updates the history of wealth brackets for the agent"
  },
  {
    "type": "check_policy",
    "message0": "If Policy is %1",
    "args0": [
      {
        "type": "field_dropdown",
        "name": "OPTION",
        "options": [
          ["Fascism", "fascism"],
          ["Capitalism", "capitalism"],
          ["Communism", "communism"],
          ["Econophysics", "econophysics"]
        ]
      }
    ],
    "message1": "Then %1",
    "args1": [{ "type": "input_statement", "name": "DO" }],
    "previousStatement": null,
    "nextStatement": null,
    "colour": BLOCK_COLOR_LOGIC,
    "tooltip": "Checks the global policy setting"
  },

  // --- POLICY BLOCKS ---
  // Each policy block has output type "Policy" so it can only slot into
  // the policy_root POLICY input. The block label (message0) is used as
  // the display name on the frontend.
  {
    "type": "execute_fascism",
    "message0": "Fascism (Pay Elites)",
    "previousStatement": "Policy",
    "nextStatement": null,
    "colour": BLOCK_COLOR_POLICY,
    "tooltip": "Agents pay tax to elites. Drop into the Active Policy slot to select this policy."
  },
  {
    "type": "check_elite",
    "message0": "If Not Party Elite %1",
    "args0": [{ "type": "input_statement", "name": "DO" }],
    "previousStatement": null,
    "nextStatement": null,
    "colour": BLOCK_COLOR_LOGIC,
    "tooltip": "Check if agent is not part of the elite"
  },
  {
    "type": "execute_wealth_exchange",
    "message0": "Econophysics (Survival / Thrive)",
    "previousStatement": "Policy",
    "nextStatement": null,
    "colour": BLOCK_COLOR_POLICY,
    "tooltip": "Standard exchange + Survival Cost + Thrive Cost. The base econophysics model."
  },
  {
    "type": "execute_capitalism",
    "message0": "Capitalism (Innovate)",
    "previousStatement": "Policy",
    "nextStatement": null,
    "colour": BLOCK_COLOR_POLICY,
    "tooltip": "Invest in innovation if wealth > capital"
  },
  {
    "type": "calc_agent_metrics",
    "message0": "Calculate Bracket & Mobility",
    "previousStatement": null,
    "nextStatement": null,
    "colour": BLOCK_COLOR_AGENT,
    "tooltip": "Determine Lower/Middle/Upper and calc mobility score"
  },
  {
    "type": "execute_communism",
    "message0": "Communism (Redistribute)",
    "previousStatement": "Policy",
    "nextStatement": null,
    "colour": BLOCK_COLOR_POLICY,
    "tooltip": "Redistribute all wealth equally. Drop into the Active Policy slot to select this policy."
  }
]);

// 3. Define the Python Generators (Logic)
// These translate the blocks into Python code.

// FIX: Detect correct generator location for modern Blockly (v10+)
var pythonGenerator = Blockly.Python.forBlock || Blockly.Python;

// policy_root: emits the Python policy name as a comment so generateAndSave()
// can read it, then emits the inner policy code and the agent step logic.
pythonGenerator['policy_root'] = function(block) {
    // Read the policy block directly to get the active policy type.
    // We do NOT use statementToCode here because that adds 4-space indent,
    // which would bury the output inside the except ImportError: block in
    // user_logic.py and prevent def step from ever being defined.
    var policyBlock = block.getInputTargetBlock('POLICY');
    var policyType  = policyBlock ? policyBlock.type : null;

    // Map built-in policy blocks → execution code (4-space indented for def body)
    var execMap = {
        'execute_wealth_exchange': '    WealthExchange().execute(self)\n',
        'execute_fascism':         '    Fascism().execute(self)\n    if not self.party_elite:\n        WealthExchange().execute(self)\n',
        'execute_capitalism':      '    Capitalism().execute(self)\n    WealthExchange().execute(self)\n',
        'execute_communism':       '    Communism().execute(self.model)\n    WealthExchange().execute(self)\n',
    };
    var keyMap = {
        'execute_wealth_exchange': 'econophysics',
        'execute_fascism':         'fascism',
        'execute_capitalism':      'capitalism',
        'execute_communism':       'communism',
    };

    var activeKey  = (policyType && keyMap[policyType])  || (policyType || 'econophysics');
    var policyExec = (policyType && execMap[policyType]) || null;

    // For AI-generated custom blocks, get execution code from their generator.
    if (policyBlock && !policyExec) {
        var customCode = (Blockly.Python.blockToCode(policyBlock) || '').trim();
        // Strip any ACTIVE_POLICY sentinel line from the custom code.
        customCode = customCode.replace(/^# ACTIVE_POLICY:.*\n?/m, '').trim();
        // Build the execution code, then always append WealthExchange so agents
        // still earn income each step (same as built-in capitalism/communism).
        policyExec = customCode
            ? customCode.split('\n').map(function(l) { return '    ' + l; }).join('\n') + '\n'
            : '';
        policyExec += '    WealthExchange().execute(self)\n';
    }
    if (!policyExec) policyExec = '    WealthExchange().execute(self)\n';

    // Get the STEPS content (agent_step_def is locked in the STEPS slot).
    // statementToCode adds 4 spaces; strip them so the output is module-level.
    var stepsRaw  = Blockly.Python.statementToCode(block, 'STEPS') || '';
    var dedent    = function(s) { return s.replace(/^    /mg, ''); };
    var stepCode  = dedent(stepsRaw);

    // Inject the policy execution call right after self.previous = self.bracket
    // so the def step body is: update → run policy → calc metrics.
    var assembled = stepCode.replace(
        /(def step\(self\):\n    self\.previous = self\.bracket\n)/,
        '$1    # ' + activeKey + '\n' + policyExec
    );

    // Fallback: if the regex didn't match, just prepend the sentinel and step code.
    if (assembled === stepCode) {
        assembled = stepCode;
    }

    return '# ACTIVE_POLICY: ' + activeKey + '\n' + assembled;
};

pythonGenerator['agent_step_def'] = function(block) { 
    var branch = Blockly.Python.statementToCode(block, 'STEPS');
    if (!branch) branch = '    pass\n';
    return 'def step(self):\n    self.previous = self.bracket\n' + branch; 
};

pythonGenerator['check_policy'] = function(block) { 
    return 'if self.model.policy == "' + block.getFieldValue('OPTION') + '":\n' + Blockly.Python.statementToCode(block, 'DO'); 
};

pythonGenerator['check_elite'] = function(block) { 
    return 'if self.party_elite == False:\n' + Blockly.Python.statementToCode(block, 'DO'); 
};

// execute_* blocks in the POLICY slot only need to identify which policy is
// selected. The actual execution call is assembled by policy_root above.
pythonGenerator['execute_fascism']         = function() { return '# ACTIVE_POLICY: fascism\n'; };
pythonGenerator['execute_capitalism']      = function() { return '# ACTIVE_POLICY: capitalism\n'; };
pythonGenerator['execute_communism']       = function() { return '# ACTIVE_POLICY: communism\n'; };
pythonGenerator['execute_wealth_exchange'] = function() { return '# ACTIVE_POLICY: econophysics\n'; };

pythonGenerator['update_history'] = function() { 
    return 'self.bracket_history.append(self.bracket)\nif len(self.bracket_history) > 20: self.bracket_history = self.bracket_history[-20:]\n'; 
};

pythonGenerator['calc_agent_metrics'] = function() { 
    return 'if self.wealth < self.model.brackets[0]: self.bracket = "Lower"\nelif self.wealth >= self.model.brackets[1]: self.bracket = "Upper"\nelse: self.bracket = "Middle"\nself.mobility = calculate_bartholomew_mobility(self)\n'; 
};