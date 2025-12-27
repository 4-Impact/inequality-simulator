import mesa
import numpy as np
from scipy.stats import expon
from utilities import calc_brackets
from agent import WealthAgent
from policyblocks import (Communism, Capitalism, Patron)



def compute_gini(model):
    agent_wealths = [abs(float(agent.wealth)) for agent in model.agents]
    x = sorted(agent_wealths)
    N = model.population
    B = sum(xi * (N - i) for i, xi in enumerate(x)) / (N * sum(x))
    return 1 + (1 / N) - 2 * B

def total_wealth(model): 
    return sum([agent.wealth for agent in model.agents])

def compute_mobility(model):
    return np.mean([agent.mobility for agent in model.agents])
       
    
class WealthModel(mesa.Model): 
    
    def __init__(self, policy="econophysics", population=200, start_up_required = 1, patron=False, seed=42):
        
        super().__init__(seed=seed)
        self.policy = policy
        self.population = population
        self.party_elite = None
        self.total = population
        self.survival_cost = 1
        self.each_wealth = 0
        self.brackets = [0.75,1.25]
        self.start_up_required = start_up_required
        self.initial_capital = 1.5
        self.patron = patron
        self.comparison_results = None
        self.comparison_running = False
        self.comparison_steps = 50  # Default steps for comparison models
        self.comparison_models = {}  # Store individual policy models
        self.comparison_step_count = 0  # Track current step in comparison
        self.datacollector = mesa.DataCollector(model_reporters = {"Gini": compute_gini,"Total": total_wealth,
                                                                   "Mobility": compute_mobility },
                                               agent_reporters={"Wealth":"wealth", "Bracket":"bracket","Pay":"W",
                                                                "Mobility": "mobility"})
        
        
        #------------------------ Model Initialization ----------------------#

        mean = 0.2      # mean of the distribution
        sigma = 0.05     # original sigma, so variance is 2*sigma^2
        variance = 2 * sigma**2

        # Generate data points from the Gaussian distribution
        payday_array = np.random.normal(mean, np.sqrt(variance), self.population) # Hyper parameter 
        
        innovation_array =  np.random.pareto(2.5,size=self.population) #Hyper parameter
        
        # round array to two decimals
        payday_array = np.around(payday_array, decimals=2)
        party_elite_cut= np.percentile(payday_array, 95)
        
        
        innovation_array = np.around(innovation_array, decimals=2)
        innovation_array = np.where(innovation_array < 1, 
                                    innovation_array + 1, 
                                    innovation_array)
        # How do you capture the opportunity to learn, plus the interest, 
        # plus the opportunity to leverage knoweldge/innovation
        innovation_array = np.where(innovation_array > 3, 
                                    3,
                                    innovation_array)
        
        for idx in range(self.population):
            party_elite=False
            if payday_array[idx] >=party_elite_cut: 
                party_elite=True
            agent = WealthAgent(self, float(payday_array[idx]), float(innovation_array[idx]), party_elite)
            
        # Initialize agent brackets based on their initial wealth
        self.initialize_agent_brackets()
        
    #----------------------- Model Helper Functions -------------------------#

    def initialize_agent_brackets(self):
        """Initialize agent brackets based on their starting wealth"""
        self.brackets = calc_brackets(self)
        for agent in self.agents:
            if agent.wealth < self.brackets[0]:
                agent.bracket = "Lower"
            elif agent.wealth >= self.brackets[1]:
                agent.bracket = "Upper"
            else: 
                agent.bracket = "Middle"
            # Update bracket history with the initial bracket
            agent.bracket_history = [agent.bracket]
    
    
    def initialize_comparison_models(self):
        """Initialize separate models for each policy"""
        policies = ["econophysics", "fascism", "communism", "capitalism"]
        self.comparison_models = {}
        self.comparison_results = {policy: {'gini': [], 'total': [], 'final_wealth': [],
                                            'final_classes': [], "mobility":[]} for policy in policies}
        self.comparison_step_count = 0
        
        for policy in policies:
            model = WealthModel(
                policy=policy,
                population=self.population,
                start_up_required=self.start_up_required,
                seed=42  # Use same seed for fair comparison
            )
            self.comparison_models[policy] = model
            
            # Collect initial data (step 0)
            gini = compute_gini(model)
            total = total_wealth(model)
            mobility = compute_mobility(model)
            self.comparison_results[policy]['gini'].append(gini)
            self.comparison_results[policy]['total'].append(total)
            self.comparison_results[policy]['mobility'].append(mobility)

        print(f"Initialized comparison models with initial data")
    
    def step_comparison_models(self):
        """Run one step for each comparison model and collect data"""
        if not hasattr(self, 'comparison_models') or not self.comparison_models:
            self.initialize_comparison_models()
        
        for policy, model in self.comparison_models.items():
            # Run one step for this model
            model.step()
            model.datacollector.collect(model)
            
            # Collect data
            gini = compute_gini(model)
            total = total_wealth(model)
            mobility = compute_mobility(model)
            print(f"Step {self.comparison_step_count}, Policy: {policy}, Gini: {gini:.3f}, "
                  f"Mobility: {mobility:.3f}, Total: {total:.2f}")

            self.comparison_results[policy]['gini'].append(gini)
            self.comparison_results[policy]['total'].append(total)
            self.comparison_results[policy]['mobility'].append(mobility)
        
        self.comparison_step_count += 1
        
        # Update final state data
        for policy, model in self.comparison_models.items():
            self.comparison_results[policy]['final_wealth'] = [agent.wealth for agent in model.agents]
            self.comparison_results[policy]['final_classes'] = [agent.bracket for agent in model.agents]
    
    def set_comparison_steps(self, steps):
        """Set the number of steps for comparison models"""
        # Only reset if steps actually changed
        if hasattr(self, 'comparison_steps') and self.comparison_steps == steps:
            return  # No change needed
            
        self.comparison_steps = steps
        # Reset comparison data only if steps changed
        if hasattr(self, 'comparison_models'):
            print(f"Resetting comparison models for {steps} steps")
            self.initialize_comparison_models()
    
    # ----------------------------- Model Step Function ---------------------#

    def step(self):
        
        self.brackets = calc_brackets(self)
        self.total = total_wealth(self)
        
        # Determine survival cost based on inflation
        exp_scale = np.mean([agent.wealth for agent in self.agents])
        if exp_scale > 1:
            self.survival_cost = expon.ppf(0.1, scale=exp_scale)

        # Determine start up cost        
        if self.policy == "capitalism":
            Capitalism().calculate_initial_capital(self)

        if self.patron == True: 
            Patron().execute(self)

        self.agents.shuffle_do("step")

        self.datacollector.collect(self)

        #----------------------- comparison of models-----------------------#
        if self.policy == "comparison":
            # Initialize comparison
            if not hasattr(self, 'comparison_models') or not self.comparison_models:
                self.initialize_comparison_models()
            
            # Run one step for all comparison models
            self.step_comparison_models()
            return

# model = WealthModel(policy="comparison", start_up_required=2)
# for _ in range(50): 
#     model.step()
# print(model.datacollector.get_model_vars_dataframe())

