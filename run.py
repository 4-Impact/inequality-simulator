# -*- coding: utf-8 -*-
"""
Created on Tue Sep 10 06:43:47 2024

@author: thoma
"""

from model import WealthModel

model = WealthModel(2000)


for step in range(10):
    model.step()
    print(step)
    
output = model.datacollector.get_agent_vars_dataframe()

output.to_csv("inequality_output.csv")

