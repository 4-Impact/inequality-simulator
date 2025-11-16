import mesa

from policyblocks import (WealthExchange, Fascism, Capitalism, Communism)
from utilities import calculate_bartholomew_mobility

class WealthAgent(mesa.Agent):
    
    def __init__(self,model, proportion,innovation,party_elite):
        super().__init__(model)
        self.wealth=1
        self.party_elite = party_elite
        self.bracket = "Middle"
        self.previous = "Middle"
        self.bracket_history = ["Middle"]  
        self.mobility = 0  
        self.W = proportion
        self.I = innovation
        self.innovating = False


    def step(self):
        
        # Update bracket 
        self.previous = self.bracket

        if self.model.policy== "fascism": 
            Fascism().execute(self)
            if self.party_elite==False: 
                WealthExchange().execute(self)
        elif self.model.policy == "capitalism":
            Capitalism().execute(self)
            WealthExchange().execute(self)
        elif self.model.policy == "communism": 
            Communism().execute(self.model)
            WealthExchange().execute(self)
        else: 
            WealthExchange().execute(self)

        #calculate bracket
        if self.wealth < self.model.brackets[0]:
            self.bracket = "Lower"
        elif self.wealth >= self.model.brackets[1]:
            self.bracket = "Upper"
        else: 
            self.bracket = "Middle"

        # Update bracket history and mobility calculation
        self.bracket_history.append(self.bracket)
        
        # Keep only recent history to prevent memory bloat (last 20 steps)
        if len(self.bracket_history) > 20:
            self.bracket_history = self.bracket_history[-20:]
        
        # Calculate Bartholomew mobility ratio
        self.mobility = calculate_bartholomew_mobility(self)

    
