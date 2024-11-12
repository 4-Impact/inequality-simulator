# -*- coding: utf-8 -*-
"""
Created on Tue Sep 10 06:06:36 2024

@author: thoma
"""

import mesa

class WealthAgent(mesa.Agent):
    
    def __init__(self,model, proportion,innovation):
        super().__init__(model)
        self.wealth=10
        self.W = proportion
        self.I = innovation
        self.ioriginal = innovation
        self.decay = 0
        
        
    def exchange(self): 

        return self.random.choice(self.model.agents)
    
    
    def step(self):
        
        """
                                PAYDAY
        """
        count = 0
        #increase wealth by proportion - payday
        self.wealth += (self.W*self.wealth)
        #self.wealth -= self.wealth*0.1 #basic survival
                        
        exchange_agent = self.exchange()
        
        if self.wealth > 0: #exchange_agent.W*self.wealth
            if exchange_agent is not None and exchange_agent is not self:
                #print(self.wealth)
                exchange_agent.wealth += (exchange_agent.W*self.wealth)
                self.wealth -= (exchange_agent.W*self.wealth)                
        '''
        else: 
            count += 1
            if count < 5: 
                self.step()
            else: 
                print(f"poor agent {self.wealth}")

        '''
        '''
                            INNOVATION
      
         '''    
        if self.model.innovation==True: 
            if self.wealth > self.model.total*model.threshold and self.I > 1.0: 
                #increase payday by innovation
                self.W*=self.I
                #Value of innovation decreases over time
                self.I-=self.decay #starts at 0
                #increase decay for next step 
                self.decay+=0.01
            else: 
                self.decay = 0 
                self.I = self.ioriginal
        
                
        