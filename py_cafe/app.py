# -*- coding: utf-8 -*-
"""
Created on Tue Sep 10 06:43:47 2024

@author: thoma
"""

from model import WealthModel
from model import Histogram, Churn, Wealth
from mesa.visualization import SolaraViz,make_plot_component


model = WealthModel()
model_params = {
    "policy": {
        "type": "Select",
        "value": "innovation",
        "values": ["econophysics", "powerful leaders","equal wealth distribution", "innovation"],
        "text": "Select Policy"
    }
}

wealth_plot = make_plot_component("Gini")

Page = SolaraViz(
    model, 
    components=[Churn, wealth_plot, Wealth, Histogram],
    model_params=model_params,
)