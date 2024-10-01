# -*- coding: utf-8 -*-
"""
Created on Tue Sep 10 06:43:47 2024

@author: thoma
"""

from model import WealthModel
from mesa.visualization import SolaraViz,make_plot_measure

model = WealthModel(2000)

model_params = {
    "population": {
        "type": "SliderInt",
        "value": 50,
        "label": "Number of agents:",
        "min": 10,
        "max": 100,
        "step": 1,
    }
}

wealth_plot = make_plot_measure("Distro")

dash = SolaraViz(
    model, 
    components=[wealth_plot],
    model_params=model_params,
)

"""
for step in range(10):
    model.step()
    print(step)
    
output = model.datacollector.get_agent_vars_dataframe()

output.to_csv("inequality_output.csv")
"""
