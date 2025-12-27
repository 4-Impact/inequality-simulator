// tpike3/inequality-simulator/inequality-simulator-main/blockly/custom_blocks.js

// Define the color scheme to match your app
const BLOCK_COLOR_AGENT = 120;
const BLOCK_COLOR_POLICY = 0;
const BLOCK_COLOR_LOGIC = 210;

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
    "tooltip": "The logic running inside every agent per turn",
    "helpUrl": ""
  },
  {
    "type": "update_history",
    "message0": "Update Bracket History",
    "previousStatement": null,
    "nextStatement": null,
    "colour": BLOCK_COLOR_AGENT,
    "tooltip": "Updates the history of wealth brackets for the agent",
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
    "tooltip": "Check if agent is not part of the elite",
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