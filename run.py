# -*- coding: utf-8 -*-
"""
Created on Tue Sep 10 06:43:47 2024

@author: thoma
"""

from model import WealthModel
from model import Histogram
from mesa.visualization import SolaraViz,make_plot_measure


model = WealthModel(200, .02, tax=0.0, innovation=False)

model_params = {
    "population": {
        "type": "SliderInt",
        "value": 50,
        "label": "Number of agents:",
        "min": 10,
        "max": 200,
        "step": 10,
    },
    "tax" : {
    "type": "SliderFloat",
    "value": 0.0, 
    "min": 0.0,
    "max":1.0,
    "step":0.05},

    "threshold": {
        "type": "SliderFloat",
        "value": 0.1,
        "label": "Innovation Threshold:",
        "min": 0,
        "max": 1,
        "step": 0.1},
    
}

wealth_plot = make_plot_measure("Gini")
total_wealth = make_plot_measure("Total")

Page = SolaraViz(
    model, 
    components=[wealth_plot,total_wealth,Histogram],
    model_params=model_params,
)
"""
for step in range(10):
    model.step()
    print(step)
    
output = model.datacollector.get_agent_vars_dataframe()

output.to_csv("inequality_output.csv")
"""
