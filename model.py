 # -*- coding: utf-8 -*-
"""
Bouchard and Mezard Wealth Inequality Model 

Adapted from Wealth Condensation in a Simple Model of the Economy

"""

import mesa
import numpy as np
import solara
from matplotlib.figure import Figure

from agent import WealthAgent


@solara.component
def Histogram(model):
    # Note: you must initialize a figure using this method instead of
    # plt.figure(), for thread safety purpose
    fig = Figure()
    ax = fig.subplots()
    wealth_vals = [agent.wealth for agent in model.agents]
    # Note: you have to use Matplotlib's OOP API instead of plt.hist
    # because plt.hist is not thread-safe.
    ax.hist(wealth_vals, bins=10)
    return solara.FigureMatplotlib(fig)

def compute_gini(model):
    agent_wealths = [abs(float(agent.wealth)) for agent in model.agents]
    x = sorted(agent_wealths)
    N = model.population
    B = sum(xi * (N - i) for i, xi in enumerate(x)) / (N * sum(x))
    return 1 + (1 / N) - 2 * B

def total_wealth(model): 
    return sum([float(agent.wealth) for agent in model.agents])


class WealthModel(mesa.Model): 
    
    def __init__(self, population, threshold, tax=0.0, debt=False, innovation=False):
        
        super().__init__()
        self.population = population
        self.threshold = threshold
        self.tax = tax
        self.tax_dynamic = int(tax*population)
        self.tax_dynamic2 = int(np.log2(population) + 1)
        self.debt = debt
        self.innovation=innovation
        self.total = self.population*10
    
        #self.schedule = mesa.time.RandomActivation(self)
        self.datacollector = mesa.DataCollector(model_reporters = {"Gini": compute_gini, "Total": total_wealth },
                                               agent_reporters={"Wealth":"wealth", "Innovation":"I","Pay":"W" })
        
        
        # create an array of iniaital weatth value    
        payday_array = np.random.normal(loc=0.5,
                                          scale=0.15,
                                          size=self.population)
        innovation_array = np.random.normal(loc=1.05,
                                          scale=0.01,
                                          size=self.population)
        # round array to two decimals
        payday_array = np.around(payday_array, decimals=2)

        innovation_array = np.around(innovation_array, decimals=2)
        
        for idx in range(self.population):
            WealthAgent(self, float(payday_array[idx]), float(innovation_array[idx]))
    
    def step(self):
        self.datacollector.collect(self)
        Histogram(self)
        self.agents.shuffle_do("step")
        self.total = total_wealth(self)
        
        # Tax Model 1 - RobinHood
        if self.tax > 0.0:
            # Sort agents from richest to poorest
            sorted_agents = sorted(self.agents, key=lambda agent: agent.wealth, reverse=True)
            taxes = 0
            for agent_idx in range(self.tax_dynamic): 
                #get percent
                tax_amount = sorted_agents[agent_idx].wealth*self.tax
                #tax wealthy
                sorted_agents[agent_idx].wealth -= tax_amount
                #give poor
                sorted_agents[-agent_idx].wealth += tax_amount
       
        '''
        # Tax Model 2 - Flat Tax
        if model.tax > 0.0: 
            # sort agents from poorest to richest
            sorted_agents = sorted(self.agents, key=lambda agent: agent.wealth)
            taxes = 0
            for agent in sorted_agents: 
                tax_amount = agent.wealth*self.tax
                taxes+=tax_amount
                agent.wealth-=tax_amount
            # determine historgram bins based on wealth distro
            counts, _ = np.histogram([agent.wealth for agent in self.agents], bins=int(np.log2(self.population) + 1))
            redistro = taxes/counts[0]
            print(taxes, redistro, counts)
            for agent in sorted_agents[:counts[0]]:
                agent.wealth+=redistro 
            
        '''

           
            