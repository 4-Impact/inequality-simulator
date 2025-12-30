// User generated blocks will be saved here


// --- New Block: universal_basic_income ---
Blockly.defineBlocksWithJsonArray([{"type": "universal_basic_income", "message0": "Universal Basic Income: Survival Amount %1 Redistribution %2", "args0": [{"type": "field_number", "name": "survival_amount", "value": 10}, {"type": "field_number", "name": "redistribution_percentage", "value": 0.02}], "previousStatement": null, "nextStatement": null, "colour": 0}]);
Blockly.Python['universal_basic_income'] = function(block) {
  var survival_amount = block.getFieldValue('survival_amount');
  var redistribution_percentage = block.getFieldValue('redistribution_percentage');
  var code = 'UniversalBasicIncome(survival_amount=' + survival_amount + ', redistribution_percentage=' + redistribution_percentage + ').execute(self, model)\n';
  return code;
};
