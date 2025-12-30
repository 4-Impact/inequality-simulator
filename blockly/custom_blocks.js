// tpike3/inequality-simulator/inequality-simulator-main/blockly/custom_blocks.js

// 1. Define the color scheme
const BLOCK_COLOR_AGENT = 120;
const BLOCK_COLOR_POLICY = 0;
const BLOCK_COLOR_LOGIC = 210;

// 2. Define the Visual Blocks (JSON)
Blockly.defineBlocksWithJsonArray([
  // --- AGENT BLOCKS ---
  {
    "type": "agent_step_def",
    "message0": "Agent Step (Individual Logic) %1 %2",
    "args0": [
      { "type": "input_dummy" },
      { "type": "input_statement", "name": "STEPS" }
    ],
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
  {
    "type": "execute_fascism",
    "message0": "Execute Fascism (Pay Tax)",
    "previousStatement": null,
    "nextStatement": null,
    "colour": BLOCK_COLOR_POLICY,
    "tooltip": "Pay tax to elites"
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
    "message0": "Execute Wealth Exchange (Survival/Thrive)",
    "previousStatement": null,
    "nextStatement": null,
    "colour": BLOCK_COLOR_POLICY,
    "tooltip": "Standard exchange + Survival Cost + Thrive Cost"
  },
  {
    "type": "execute_capitalism",
    "message0": "Execute Capitalism (Innovate)",
    "previousStatement": null,
    "nextStatement": null,
    "colour": BLOCK_COLOR_POLICY,
    "tooltip": "Invest in innovation if wealth > capital"
  },
  {
    "type": "execute_communism",
    "message0": "Execute Communism (Redistribute)",
    "previousStatement": null,
    "nextStatement": null,
    "colour": BLOCK_COLOR_POLICY,
    "tooltip": "Redistribute all wealth equally"
  },
  {
    "type": "calc_agent_metrics",
    "message0": "Calculate Bracket & Mobility",
    "previousStatement": null,
    "nextStatement": null,
    "colour": BLOCK_COLOR_AGENT,
    "tooltip": "Determine Lower/Middle/Upper and calc mobility score"
  }
]);

// 3. Define the Python Generators (Logic)
// These translate the blocks into Python code.

Blockly.Python['agent_step_def'] = function(block) { 
    var branch = Blockly.Python.statementToCode(block, 'STEPS');
    if (!branch) branch = '    pass\n';
    return 'def step(self):\n    self.previous = self.bracket\n' + branch; 
};

Blockly.Python['check_policy'] = function(block) { 
    return 'if self.model.policy == "' + block.getFieldValue('OPTION') + '":\n' + Blockly.Python.statementToCode(block, 'DO'); 
};

Blockly.Python['check_elite'] = function(block) { 
    return 'if self.party_elite == False:\n' + Blockly.Python.statementToCode(block, 'DO'); 
};

Blockly.Python['execute_fascism'] = function() { return 'Fascism().execute(self)\n'; };
Blockly.Python['execute_capitalism'] = function() { return 'Capitalism().execute(self)\n'; };
Blockly.Python['execute_communism'] = function() { return 'Communism().execute(self.model)\n'; };
Blockly.Python['execute_wealth_exchange'] = function() { return 'WealthExchange().execute(self)\n'; };

Blockly.Python['update_history'] = function() { 
    return 'self.bracket_history.append(self.bracket)\nif len(self.bracket_history) > 20: self.bracket_history = self.bracket_history[-20:]\n'; 
};

Blockly.Python['calc_agent_metrics'] = function() { 
    return 'if self.wealth < self.model.brackets[0]: self.bracket = "Lower"\nelif self.wealth >= self.model.brackets[1]: self.bracket = "Upper"\nelse: self.bracket = "Middle"\nself.mobility = calculate_bartholomew_mobility(self)\n'; 
};