import mesa
import numpy as np
from scipy.stats import expon
from utilities import calc_brackets
from agent import WealthAgent
from policyblocks import (Communism, Capitalism, Patron)

def compute_gini(model):
    #if not model.agents: return 0
    agent_wealths = [abs(float(agent.wealth)) for agent in model.agents]
    x = sorted(agent_wealths)
    N = len(agent_wealths)
    if N == 0: return 0
    B = sum(xi * (N - i) for i, xi in enumerate(x)) / (N * sum(x))
    return 1 + (1 / N) - 2 * B

def total_wealth(model): 
    #if not model.agents: return 0
    return sum([agent.wealth for agent in model.agents])

def compute_mobility(model):
    #if not model.agents: return 0
    return np.mean([agent.mobility for agent in model.agents])
       
class WealthModel(mesa.Model): 
    
    def __init__(self, policy="econophysics", population=200, start_up_required=1, patron=False, seed=42):
        
        super().__init__(seed=seed)
        self.policy = policy
        self.population = population
        self.party_elite = None
        self.survival_cost = 1
        self.brackets = [0.75, 1.25]
        self.start_up_required = start_up_required
        self.patron = patron
        self.total = total_wealth(self)
        
        # Initialize containers
        self.comparison_results = {}
        self.comparison_models = {} 
        self.comparison_step_count = 0
        
        # Data Collector
        self.datacollector = mesa.DataCollector(
            model_reporters={"Gini": compute_gini, "Total": total_wealth, "Mobility": compute_mobility},
            agent_reporters={"Wealth": "wealth", "Bracket": "bracket", "Pay": "W", "Mobility": "mobility"}
        )

        # --- LOGIC BRANCHING ---
        if self.policy == "comparison":
            # If Comparison Mode: Initialize sub-models IMMEDIATELY
            # Do NOT create agents for this wrapper model
            self.initialize_comparison_models()
        else:
            # If Single Policy Mode: Create agents for this model
            self.create_agents()
            self.initialize_agent_brackets()

    def create_agents(self):
        """Generates the population for a single model instance"""
        mean = 0.2
        sigma = 0.05
        variance = 2 * sigma**2

        payday_array = np.random.normal(mean, np.sqrt(variance), self.population)
        innovation_array = np.random.pareto(2.5, size=self.population)
        
        payday_array = np.around(payday_array, decimals=2)
        party_elite_cut = np.percentile(payday_array, 95)
        
        innovation_array = np.around(innovation_array, decimals=2)
        innovation_array = np.where(innovation_array < 1, innovation_array + 1, innovation_array)
        innovation_array = np.where(innovation_array > 3, 3, innovation_array)
        
        for idx in range(self.population):
            party_elite = False
            if payday_array[idx] >= party_elite_cut: 
                party_elite = True
            # Note: We don't need to explicitly add to a schedule list in Mesa 3.0+, 
            # but we ensure agents are registered to this model instance.
            WealthAgent(self, float(payday_array[idx]), float(innovation_array[idx]), party_elite)

    def initialize_agent_brackets(self):
        """Initialize agent brackets based on their starting wealth"""
        if not self.agents: return
        self.brackets = calc_brackets(self)
        for agent in self.agents:
            if agent.wealth < self.brackets[0]:
                agent.bracket = "Lower"
            elif agent.wealth >= self.brackets[1]:
                agent.bracket = "Upper"
            else: 
                agent.bracket = "Middle"
            agent.bracket_history = [agent.bracket]
    
    def initialize_comparison_models(self):
        """Initialize separate models for each policy"""
        policies = ["econophysics", "fascism", "communism", "capitalism"]
        self.comparison_models = {}
        self.comparison_results = {policy: {'gini': [], 'total': [], 'final_wealth': [],
                                            'final_classes': [], "mobility":[]} for policy in policies}
        self.comparison_step_count = 0
        
        print("Initializing comparison sub-models...")
        for policy in policies:
            # Create sub-model
            model = WealthModel(
                policy=policy,
                population=self.population,
                start_up_required=self.start_up_required,
                patron=self.patron,
                seed=self._seed # Inherit seed
            )
            self.comparison_models[policy] = model
            
            # Collect initial data (Step 0)
            gini = compute_gini(model)
            total = total_wealth(model)
            mobility = compute_mobility(model)
            
            self.comparison_results[policy]['gini'].append(gini)
            self.comparison_results[policy]['total'].append(total)
            self.comparison_results[policy]['mobility'].append(mobility)
            
            # Initial wealth snapshot for histograms
            self.comparison_results[policy]['final_wealth'] = [a.wealth for a in model.agents]

    def step_comparison_models(self):
        """Run one step for each comparison model"""
        for policy, model in self.comparison_models.items():
            model.step()
            # Note: model.step() calls model.datacollector.collect(model) inside it
            
            # Collect aggregate data for the comparison views
            gini = compute_gini(model)
            total = total_wealth(model)
            mobility = compute_mobility(model)

            self.comparison_results[policy]['gini'].append(gini)
            self.comparison_results[policy]['total'].append(total)
            self.comparison_results[policy]['mobility'].append(mobility)
            
            # Update snapshots
            self.comparison_results[policy]['final_wealth'] = [a.wealth for a in model.agents]
            self.comparison_results[policy]['final_classes'] = [a.bracket for a in model.agents]
        
        self.comparison_step_count += 1
        print(f"Comparison Step {self.comparison_step_count} completed.")

    def step(self):
        # --- BRANCHING LOGIC ---
        if self.policy == "comparison":
            # ONLY step the sub-models. 
            # Do NOT run logic for this wrapper container.
            self.step_comparison_models()
            return

        # --- SINGLE MODEL LOGIC ---
        self.brackets = calc_brackets(self)
        self.total = total_wealth(self)
        
        # Survival Cost
        exp_scale = np.mean([agent.wealth for agent in self.agents])
        if exp_scale > 1:
            self.survival_cost = expon.ppf(0.1, scale=exp_scale)

        # Start up cost logic
        if self.policy == "capitalism":
            Capitalism().calculate_initial_capital(self)

        if self.patron: 
            Patron().execute(self)

        self.agents.shuffle_do("step")
        self.datacollector.collect(self)