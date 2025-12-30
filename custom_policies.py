# Custom user-generated policies will be appended here



class UniversalBasicIncome:
    def __init__(self, survival_amount, redistribution_percentage):
        self.survival_amount = survival_amount
        self.redistribution_percentage = redistribution_percentage

    def execute(self, agent, model):
        wealthiest_agents = sorted(model.schedule.agents, key=lambda a: a.wealth, reverse=True)
        total_wealth = sum(agent.wealth for agent in model.schedule.agents)
        
        # Calculate total amount available for redistribution based on wealth of wealthiest agents.
        amount_to_redistribute = 0
        for wealthy_agent in wealthiest_agents:
            # Determine the excess wealth above an acceptable level for each agent.
            excess_wealth = max(0, wealthy_agent.wealth - (total_wealth / len(model.schedule.agents)) * (1 + self.redistribution_percentage))
            amount_to_redistribute += excess_wealth
            
            # Transfer wealth to redistribution pool.
            wealthy_agent.wealth -= excess_wealth
        
        # Distribute wealth to agents below survival threshold.
        for agent in model.schedule.agents:
            if agent.wealth < self.survival_amount:
                agent.wealth += amount_to_redistribute / len(model.schedule.agents) #Distribute equally

