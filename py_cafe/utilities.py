 # -*- coding: utf-8 -*-
"""
Bouchard and Mezard Wealth Inequality Model 

Adapted from Wealth Condensation in a Simple Model of the Economy

"""

def calc_brackets(model): 
        most = max([agent.wealth for agent in model.agents])
        return [int(most*0.33), int(most*0.67)]
#Helper function for churn

def calculate_churn(model): 
    moving_up = 0
    moving_down = 0

    for agent in model.agents: 
        if agent.previous != agent.bracket: 
            if agent.previous == "Middle":
                if agent.bracket == "Upper":
                    moving_up += 1
                elif agent.bracket == "Lower":
                    moving_down += 1
            if agent.previous == "Upper":
                if agent.bracket == "Middle" or agent.bracket == "Lower": 
                    moving_down += 1
            if agent.previous == "Lower":
                if agent.bracket == "Upper" or agent.bracket == "Middle":
                    moving_up += 1
    totals = model.agents.groupby("bracket").count()
    if "Upper" not in totals:
        totals["Upper"] = 0
    if "Middle" not in totals:
        totals["Middle"]=0
    if "Lower" not in totals: 
        totals["Lower"]=0
    return [moving_up, moving_down, totals]
                                        
                
def number_to_words(n):
    # Define thresholds and corresponding words, adding "Trillion"
    thresholds = [
        (1_000_000_000_000, 'Trillion'),
        (1_000_000_000, 'Billion'),
        (1_000_000, 'Million'),
        (1_000, 'Thousand')
    ]
    
    # Loop through thresholds to determine appropriate scale
    for threshold, word in thresholds:
        if n >= threshold:
            value = n / threshold
            return f"{int(value)} {word}"
    
    # If less than 1000, just return the number as a string
    return str(n)   
    