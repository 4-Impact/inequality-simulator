// tpike3/inequality-simulator/inequality-simulator-code_viz/blockly/custom_blocks.js

// Define the color scheme to match your app
const BLOCK_COLOR_MODEL = 230;
const BLOCK_COLOR_AGENT = 120;
const BLOCK_COLOR_POLICY = 0;
const BLOCK_COLOR_LOGIC = 210;

Blockly.defineBlocksWithJsonArray([
  // --- MODEL BLOCKS ---
  {
    "type": "model_step_def",
    "message0": "Model Step (Orchestrator) %1 %2",
    "args0": [
      { "type": "input_dummy" },
      { "type": "input_statement", "name": "STEPS" }
    ],
    "colour": BLOCK_COLOR_MODEL,
    "tooltip": "The main step function in model.py",
    "helpUrl": ""
  },
  {
    "type": "calc_metrics",
    "message0": "Calculate Metrics (Wealth Classes, Total Wealth)",
    "previousStatement": null,
    "nextStatement": null,
    "colour": BLOCK_COLOR_MODEL,
    "tooltip": "Calculates wealth brackets and total wealth",
    "helpUrl": ""
  },
  {
    "type": "calc_survival",
    "message0": "Calculate Survival Cost",
    "previousStatement": null,
    "nextStatement": null,
    "colour": BLOCK_COLOR_MODEL,
    "tooltip": "Updates survival cost based on inflation",
    "helpUrl": ""
  },
  {
    "type": "policy_config_check",
    "message0": "If Policy is %1",
    "args0": [
      {
        "type": "field_dropdown",
        "name": "OPTION",
        "options": [
          ["Capitalism", "capitalism"],
          ["Patron System", "patron"]
        ]
      }
    ],
    "message1": "%1",
    "args1": [{ "type": "input_statement", "name": "DO" }],
    "previousStatement": null,
    "nextStatement": null,
    "colour": BLOCK_COLOR_LOGIC,
    "tooltip": "Checks configuration flags",
    "helpUrl": ""
  },
  {
    "type": "calc_startup_capital",
    "message0": "Calculate Initial Startup Capital",
    "previousStatement": null,
    "nextStatement": null,
    "colour": BLOCK_COLOR_POLICY,
    "tooltip": "Capitalism specific logic",
    "helpUrl": ""
  },
  {
    "type": "execute_patron",
    "message0": "Execute Patron Logic",
    "previousStatement": null,
    "nextStatement": null,
    "colour": BLOCK_COLOR_POLICY,
    "tooltip": "Wealthiest 20% give to others",
    "helpUrl": ""
  },
  {
    "type": "agent_loop",
    "message0": "Shuffle and Step All Agents",
    "previousStatement": null,
    "nextStatement": null,
    "colour": BLOCK_COLOR_MODEL,
    "tooltip": "Iterates through all agents in random order",
    "helpUrl": ""
  },
  {
    "type": "collect_data",
    "message0": "Collect Data (Gini, Mobility)",
    "previousStatement": null,
    "nextStatement": null,
    "colour": BLOCK_COLOR_MODEL,
    "tooltip": "Mesa DataCollector",
    "helpUrl": ""
  },

  // --- AGENT BLOCKS ---
  {
    "type": "agent_step_def",
    "message0": "Agent Step (Individual Logic) %1 %2",
    "args0": [
      { "type": "input_dummy" },
      { "type": "input_statement", "name": "STEPS" }
    ],
    "colour": BLOCK_COLOR_AGENT,
    "tooltip": "The logic running inside every agent per turn",
    "helpUrl": ""
  },
  {
    "type": "update_history",
    "message0": "Update Bracket History",
    "previousStatement": null,
    "nextStatement": null,
    "colour": BLOCK_COLOR_AGENT,
    "tooltip": "",
    "helpUrl": ""
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
    "tooltip": "Checks the global policy setting",
    "helpUrl": ""
  },
  {
    "type": "execute_fascism",
    "message0": "Execute Fascism (Pay Tax)",
    "previousStatement": null,
    "nextStatement": null,
    "colour": BLOCK_COLOR_POLICY,
    "tooltip": "Pay tax to elites",
    "helpUrl": ""
  },
  {
    "type": "check_elite",
    "message0": "If Not Party Elite %1",
    "args0": [{ "type": "input_statement", "name": "DO" }],
    "previousStatement": null,
    "nextStatement": null,
    "colour": BLOCK_COLOR_LOGIC,
    "tooltip": "",
    "helpUrl": ""
  },
  {
    "type": "execute_wealth_exchange",
    "message0": "Execute Wealth Exchange (Survival/Thrive)",
    "previousStatement": null,
    "nextStatement": null,
    "colour": BLOCK_COLOR_POLICY,
    "tooltip": "Standard exchange + Survival Cost + Thrive Cost",
    "helpUrl": ""
  },
  {
    "type": "execute_capitalism",
    "message0": "Execute Capitalism (Innovate)",
    "previousStatement": null,
    "nextStatement": null,
    "colour": BLOCK_COLOR_POLICY,
    "tooltip": "Invest in innovation if wealth > capital",
    "helpUrl": ""
  },
  {
    "type": "execute_communism",
    "message0": "Execute Communism (Redistribute)",
    "previousStatement": null,
    "nextStatement": null,
    "colour": BLOCK_COLOR_POLICY,
    "tooltip": "Redistribute all wealth equally",
    "helpUrl": ""
  },
  {
    "type": "calc_agent_metrics",
    "message0": "Calculate Bracket & Mobility",
    "previousStatement": null,
    "nextStatement": null,
    "colour": BLOCK_COLOR_AGENT,
    "tooltip": "Determine Lower/Middle/Upper and calc mobility score",
    "helpUrl": ""
  }
]);