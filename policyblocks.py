'''
This modules provides the main policies incorporated into the wealth
inequality model
'''

import numpy as np

# Called by Agent
class WealthExchange:
    '''
    Wealth exchange has three parts:        
    1- Agent adds agent proportion of wealth per their attribute
    2- Agent Pays survival cost to other agent (e.g. bread, shelter)
    3- Agent pays thrive cost to other agent (e.g. TV)
    '''

    def execute(self, agent):
        # Get paid - Base injector of wealth into the economy
        agent.wealth += (agent.W*agent.wealth)
        
        # Survival Cost
        """
        Pays another agent based on population wealth cost some
        amount of money
        """
        survival_agent = agent.model.random.choice(agent.model.agents) 
        if agent.wealth > agent.model.survival_cost and agent is not survival_agent: 
            agent.wealth -= agent.model.survival_cost
            survival_agent.wealth += agent.model.survival_cost
        else: 
            agent.wealth -= agent.wealth
            survival_agent.wealth += agent.wealth
            #Reset wealth
            agent.wealth = 1
        
        # Thrive cost
        """
        Thrive dynamic pays other agent based on their wealth proportion
        for some good or service
        """
        thrive_agent = agent.model.random.choice(agent.model.agents)
        if agent.wealth > (thrive_agent.W*agent.wealth) and thrive_agent is not agent: 
            thrive_agent.wealth += (thrive_agent.W*agent.wealth)
            agent.wealth -= (thrive_agent.W*agent.wealth)




# Called by Agent
class Communism: 
    def execute(self, model): 
        each_wealth = model.total/model.population
        for agent in model.agents: 
            agent.wealth=each_wealth

# Called by agent
class Fascism: 
    def execute(self, agent):
        if agent.party_elite == False: 
            party_elites = agent.model.agents.select(lambda a: a.party_elite==True)
            # Pay tax to party elite
            party_elite = agent.random.choice(party_elites)
            party_elite.wealth += agent.wealth*0.2 # Party tax is a hyper parameter
            agent.wealth -= agent.wealth*0.2

# Called by agent and model 
class Capitalism: 

    # Helper function for determining initial_start_up
    def start_up_required(self,model): 
        # Number of bins using Sturges' rule
        num_bins = int(np.ceil(np.log2(model.population) + 1))
        
        wealth_list = np.array([agent.wealth for agent in model.agents])
        # Create the bins
        bin_edges = np.linspace(min(wealth_list), max(wealth_list), num_bins + 1)
        # Find the max value in each bin
        bin_max_values = []
        for i in range(len(bin_edges) - 1):
            # Get the lower and upper bound of the current bin
            lower_bound = bin_edges[i]
            upper_bound = bin_edges[i + 1]
            # Find the values in this bin
            values_in_bin = wealth_list[(wealth_list >= lower_bound) & (wealth_list <= upper_bound)]
            # Find the max value in the bin (if any values are in the bin)
            if len(values_in_bin) > 0:
                bin_max_values.append(max(values_in_bin))
            else:
                bin_max_values.append(None)  # No values in this bin
        return bin_max_values
    
    # Called by model 
    # Calculate the population level start up capital 
    def calculate_initial_capital(self, model): 
        bins = self.start_up_required(model)
        if model.start_up_required==1: 
            model.initial_capital = bins[0]
        elif model.start_up_required==2: 
            mid = len(bins) // 2
            model.initial_capital =bins[mid]
        else:
            model.initial_capital =bins[-1]
        model.initial_capital =bins[-1]
        if model.initial_capital < 1.5: 
            model.initial_capital = 1.5
    
    # Called by Agent
    def execute(self, agent):
        # Agent's innovation can lead to increased wealth 
        # Start innovation 
        if agent.wealth > agent.model.initial_capital and agent.innovating == False: 
                agent.innovating = True
                #increase payday by innovation
                agent.W*=agent.I
                #Value of innovation decreases over time
                agent.I*=0.5  # Hyper parameter
        # Reset innovation
        elif agent.I < 1: 
            self.innovating = False 
            # New agent innovation changes due to shifting fitness landscape
            innovation_multiplier = np.random.pareto(2.5) # Hyper parameter
            if innovation_multiplier < 1: 
                innovation_multiplier += 1
            agent.I = innovation_multiplier

        else: 
            pass

# Called by model 
class Patron(): 
    def execute(self, model):
        # Identify the wealthiest 20% --in 200 thats 40.
        top_count = max(1, int(model.population * 0.20))
        patron_agents = sorted(model.agents, key=lambda a: a.wealth, reverse=True)[:top_count]
        patron_set = set(patron_agents)

        # Build a pool that excludes all top agents (they cannot be sampled)
        available_pool = [a for a in model.agents if a not in patron_set]

        for patron in patron_agents:
            # Take a random sample (their "network") from non-top agents only
            sample_size = max(1, int(len(available_pool) * 0.3))
            sample_size = min(sample_size, len(available_pool))
            network_agents = model.random.sample(available_pool, sample_size)
            client_agent = model.random.choice(network_agents)
            # Give an amount to the most innovative agent in the sample
            transfer_amount = 0.10 * patron.wealth  # 10% of agent's wealth
            #if agent.wealth > transfer_amount:
            patron.wealth -= transfer_amount
            client_agent.wealth += transfer_amount
        
        


        