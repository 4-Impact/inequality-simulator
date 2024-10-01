# -*- coding: utf-8 -*-
"""
Created on Tue Sep 10 06:06:36 2024

@author: thoma
"""

import mesa

class WealthAgent(mesa.Agent):
    
    def __init__(self,model, proportion):
        super().__init__(model)
        self.wealth=38000
        self.W =proportion
        
        
    def step(self):
        #increase welath by proportion - payday
        self.wealth += (self.W*self.wealth)
        #self.wealth -= 10000 #surival expense
        
        if self.wealth > 0: 
            #get basic expenses
            exchange_agent = self.random.choice(self.model.agents)
            if exchange_agent is not None and exchange_agent is not self:
                #print(self.wealth)
                exchange_agent.wealth += (exchange_agent.W*self.wealth)
                self.wealth -= (exchange_agent.W*self.wealth)
                #print (exchange_agent.wealth, self.wealth) 
                
        