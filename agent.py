# -*- coding: utf-8 -*-
"""
Created on Tue Sep 10 06:06:36 2024

@author: thoma
"""

import mesa

class WealthAgent(mesa.Agent):
    
    def __init__(self,model,wealth):
        super().__init__(model)
        self.wealth=wealth
        
    def step(self):
        print(self.wealth)
        