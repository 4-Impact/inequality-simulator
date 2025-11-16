 # -*- coding: utf-8 -*-
"""
Bouchard and Mezard Wealth Inequality Model 

Adapted from Wealth Condensation in a Simple Model of the Economy

"""
import numpy as np 


#====================== Agent Utilities====================================#

def calculate_bartholomew_mobility(agent):
        """
        Calculate Bartholomew mobility ratio:
        Expected absolute change in position divided by maximum possible change
        """
        if len(agent.bracket_history) < 2:
            return 0.0
        
        # Map brackets to numerical positions (0=Lower, 1=Middle, 2=Upper)
        bracket_to_position = {"Lower": 0, "Middle": 1, "Upper": 2}
        
        positions = [bracket_to_position[bracket] for bracket in agent.bracket_history]
        
        # Calculate absolute changes between consecutive time periods
        absolute_changes = []
        for i in range(1, len(positions)):
            absolute_changes.append(abs(positions[i] - positions[i-1]))
        
        if not absolute_changes:
            return 0.0
            
        # Expected absolute change (mean of absolute changes)
        expected_absolute_change = sum(absolute_changes) / len(absolute_changes)
        
        # Maximum possible change (from lowest to highest position or vice versa)
        max_possible_change = 2.0  # From Lower (0) to Upper (2) or vice versa
        
        # Bartholomew mobility ratio
        if max_possible_change == 0:
            return 0.0
        
        mobility_ratio = expected_absolute_change / max_possible_change
        
        # Ensure the ratio is between 0 and 1
        return max(0.0, min(1.0, mobility_ratio))

def calc_brackets(model): 
        wealth_data = [agent.wealth for agent in model.agents]

        # If there's no wealth data, return default brackets
        if not wealth_data:
            return [0, 0]

        # Define brackets using the 33rd and 67th percentiles of the wealth distribution
        lower_bracket = np.percentile(wealth_data, 33)
        upper_bracket = np.percentile(wealth_data, 67)

        return [lower_bracket, upper_bracket]


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
                                        
    