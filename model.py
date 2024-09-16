 # -*- coding: utf-8 -*-
"""
Bouchard and Mezard Wealth Inequality Model 

Adapted from Wealth Condensation in a Simple Model of the Economy

"""

import mesa
import numpy as np

from agent import WealthAgent


class WealthModel(mesa.Model): 
    
    def __init__(self, population):
                 #average_income = 38000,
                 #standard_deviation = 1818): #obtained from https://apps.bea.gov/scb/issues/2021/01-january/0121-revisions-to-gdp-gdi.htm
        
        super().__init__()
        self.population = population
        
        self.schedule = mesa.time.RandomActivation(self)
        self.datacollector = mesa.DataCollector(agent_reporters={"Wealth":"wealth"})
        
        
        # create an array of iniaital weatth value    
        gaussian_array = np.random.normal(loc=0.5,
                                          scale=0.15,
                                          size=self.population)
        # round array to two decimals
        gaussian_array = np.around(gaussian_array, decimals=2)
        
        for idx in range(self.population):
            agent = WealthAgent(self, gaussian_array[idx])
            self.schedule.add(agent)
    
    def step(self):
        self.datacollector.collect(self)
        self.schedule.step()

           
            