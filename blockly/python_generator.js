// tpike3/inequality-simulator/inequality-simulator-code_viz/blockly/python_generators.js

// 1. Logic for Agent Blocks (links to agent.py)
Blockly.Python['agent_step_def'] = function(block) {
  var statements_steps = Blockly.Python.statementToCode(block, 'STEPS');
  // Generates the standard Mesa Agent step method signature
  var code = 'def step(self):\n' + 
             '    # Update bracket\n' + 
             '    self.previous = self.bracket\n\n' + 
             statements_steps;
  return code;
};

Blockly.Python['check_policy'] = function(block) {
  var dropdown_option = block.getFieldValue('OPTION');
  var statements_do = Blockly.Python.statementToCode(block, 'DO');
  
  // Maps directly to: if self.model.policy == "fascism":
  var code = 'if self.model.policy == "' + dropdown_option + '":\n' + statements_do;
  return code;
};

Blockly.Python['execute_fascism'] = function(block) {
  // Links to policyblocks.py Fascism class
  return '    Fascism().execute(self)\n';
};

Blockly.Python['execute_capitalism'] = function(block) {
  return '    Capitalism().execute(self)\n';
};

Blockly.Python['execute_communism'] = function(block) {
  return '    Communism().execute(self.model)\n'; // Note: Communism takes 'model' args in your code
};

Blockly.Python['execute_wealth_exchange'] = function(block) {
  return '    WealthExchange().execute(self)\n';
};

Blockly.Python['check_elite'] = function(block) {
  var statements_do = Blockly.Python.statementToCode(block, 'DO');
  return '    if self.party_elite == False:\n' + statements_do;
};

Blockly.Python['update_history'] = function(block) {
  return '    # Update bracket history (standard boilerplate)\n' +
         '    self.bracket_history.append(self.bracket)\n' +
         '    if len(self.bracket_history) > 20:\n' +
         '        self.bracket_history = self.bracket_history[-20:]\n';
};

Blockly.Python['calc_agent_metrics'] = function(block) {
  return '    # Calculate bracket\n' +
         '    if self.wealth < self.model.brackets[0]:\n' +
         '        self.bracket = "Lower"\n' +
         '    elif self.wealth >= self.model.brackets[1]:\n' +
         '        self.bracket = "Upper"\n' +
         '    else:\n' +
         '        self.bracket = "Middle"\n' +
         '    self.mobility = calculate_bartholomew_mobility(self)\n';
};