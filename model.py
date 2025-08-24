import mesa
import numpy as np
from scipy.stats import expon
from utilities import calc_brackets



def compute_gini(model):
    agent_wealths = [abs(float(agent.wealth)) for agent in model.agents]
    x = sorted(agent_wealths)
    N = model.population
    B = sum(xi * (N - i) for i, xi in enumerate(x)) / (N * sum(x))
    return 1 + (1 / N) - 2 * B

def total_wealth(model): 
    return sum([agent.wealth for agent in model.agents])


#######################################################################################################


                                        #Agent

###################################################################################################


class WealthAgent(mesa.Agent):
    
    def __init__(self,model, proportion,innovation,party_elite):
        super().__init__(model)
        self.wealth=1
        self.party_elite = party_elite
        self.bracket = "Middle"
        self.previous = "Middle"
        self.bracket_history = ["Middle"]  # Store bracket history for mobility calculation
        self.mobility = 0  # Will now store Bartholomew mobility ratio
        self.W = proportion
        self.I = innovation
        self.ioriginal = innovation
        self.decay = 0
        
        
    def exchange(self): 

        return self.random.choice(self.model.agents)
    
    def calculate_bartholomew_mobility(self):
        """
        Calculate Bartholomew mobility ratio:
        Expected absolute change in position divided by maximum possible change
        """
        if len(self.bracket_history) < 2:
            return 0.0
        
        # Map brackets to numerical positions (0=Lower, 1=Middle, 2=Upper)
        bracket_to_position = {"Lower": 0, "Middle": 1, "Upper": 2}
        
        positions = [bracket_to_position[bracket] for bracket in self.bracket_history]
        
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
    
    
    def step(self):
        
        """
                                PAYDAY
        """
        self.previous = self.bracket
        count = 0
        #increase wealth by proportion - payday
        self.wealth += (self.W*self.wealth)
        
        
        if self.wealth > self.model.survival_cost and self.wealth > 0: 
            self.wealth -= self.model.survival_cost
        else: 
            self.wealth -= self.wealth
        
        if self.model.policy=="powerful leaders" or self.model.policy=="equal wealth distribution": 
            party_elites = self.model.agents.select(lambda a: a.party_elite==True)
            #pay tax to the party_elite
            party_elite = self.random.choice(party_elites)
            party_elite.wealth += self.wealth*.05
            self.wealth -= self.wealth*.05
                        
        exchange_agent = self.random.choice(self.model.agents)
        
        if self.wealth >= 0 and exchange_agent is not None and exchange_agent is not self:
            exchange_agent.wealth += (exchange_agent.W*self.wealth)
            self.wealth -= (exchange_agent.W*self.wealth)      

        #calculate bracket
        if self.wealth < self.model.brackets[0]:
            self.bracket = "Lower"
        elif self.wealth >= self.model.brackets[1]:
            self.bracket = "Upper"
        else: 
            self.bracket = "Middle"

        # Update bracket history and mobility calculation
        self.bracket_history.append(self.bracket)
        
        # Keep only recent history to prevent memory bloat (last 20 steps)
        if len(self.bracket_history) > 20:
            self.bracket_history = self.bracket_history[-20:]
        
        # Calculate Bartholomew mobility ratio
        self.mobility = self.calculate_bartholomew_mobility()
        """
                            INNOVATION
        """
           
        if self.model.policy=="Innovation": 
            if self.wealth > self.model.inital_captial: 
                #increase payday by innovation
                self.W*=self.I
                #Value of innovation decreases over time
                self.I-=self.decay #starts at 0
                #increase decay for next step 
                self.decay+=0.1
            else: 
                self.decay = 0 
                self.I = self.ioriginal


    def calc_brackets(model): 
        most = max([agent.wealth for agent in model.agents])
        print(f"Most {most}")
        return [int(most*0.33), int(most*0.67)]

def start_up_required(model): 

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
        values_in_bin = wealth_list[(wealth_list >= lower_bound) & (wealth_list < upper_bound)]
        
        # Find the max value in the bin (if any values are in the bin)
        if len(values_in_bin) > 0:
            bin_max_values.append(max(values_in_bin))
        else:
            bin_max_values.append(None)  # No values in this bin
    return bin_max_values

##############################################################################################

                                    #Model

#############################################################################################
    
class WealthModel(mesa.Model): 
    
    def __init__(self, policy="econophysics", population=200, start_up_required = 1, seed=42):
        
        super().__init__(seed=seed)
        self.policy = policy
        self.population = population
        self.party_elite = None
        self.total = population
        self.survival_cost = 0
        self.each_wealth = 0
        self.brackets = [0.75,1.25]
        self.start_up_required = start_up_required
        self.inital_capital = 1.5
        self.comparison_results = None
        self.comparison_running = False
        self.comparison_steps = 50  # Default steps for comparison models
        self.comparison_models = {}  # Store individual policy models
        self.comparison_step_count = 0  # Track current step in comparison
        
        self.datacollector = mesa.DataCollector(model_reporters = {"Gini": compute_gini,"Total": total_wealth },
                                               agent_reporters={"Wealth":"wealth", "Bracket":"bracket","Pay":"W",
                                                                "Mobility": "mobility"})
        
        
        mean = 0.2      # mean of the distribution
        sigma = 0.05     # original sigma, so variance is 2*sigma^2
        variance = 2 * sigma**2

        # Generate data points from the Gaussian distribution
        payday_array = np.random.normal(mean, np.sqrt(variance), self.population)
        
        
        innovation_array =  np.random.pareto(2.5,size=self.population)
        
        # round array to two decimals
        payday_array = np.around(payday_array, decimals=2)
        party_elite_cut= np.percentile(payday_array, 95)
        
        innovation_array = np.around(innovation_array, decimals=2)
        
        for idx in range(self.population):
            party_elite=False
            if payday_array[idx] >=party_elite_cut: 
                party_elite=True
            agent = WealthAgent(self, float(payday_array[idx]), float(innovation_array[idx]), party_elite)
            
        # Initialize agent brackets based on their initial wealth
        self.initialize_agent_brackets()
    
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
        policies = ["econophysics", "powerful leaders", "equal wealth distribution", "innovation"]
        self.comparison_models = {}
        self.comparison_results = {policy: {'gini': [], 'total': [], 'final_wealth': [], 'final_classes': []} for policy in policies}
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
            self.comparison_results[policy]['gini'].append(gini)
            self.comparison_results[policy]['total'].append(total)
            
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
            
            print(f"Step {self.comparison_step_count}, Policy: {policy}, Gini: {gini:.3f}, Total: {total:.2f}")
            
            self.comparison_results[policy]['gini'].append(gini)
            self.comparison_results[policy]['total'].append(total)
        
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
    
    def step(self):
        self.brackets = calc_brackets(self)
        self.total = total_wealth(self)
        # Determine survival cost based on inflation
        exp_scale = np.mean([agent.wealth for agent in self.agents])
        self.survival_cost = expon.ppf(0.1, scale=exp_scale)
        
        if self.policy == "comparison":
            # Initialize comparison models if needed
            if not hasattr(self, 'comparison_models') or not self.comparison_models:
                self.initialize_comparison_models()
            
            # Run one step for all comparison models
            self.step_comparison_models()
            return  # Don't run normal step for comparison mode
        
        if self.policy=="econophysics": 
            self.agents.shuffle_do("step")
        
        # party_elites can only receive from subordinates but never give money
        elif self.policy=="powerful leaders": 
            subordinates = self.agents.select(lambda a: a.party_elite==False)
            subordinates.shuffle_do("step")
        
        # Divide the wealth equally among all agents at the beginning of the time step
        elif self.policy=="equal wealth distribution": 
            each_wealth = self.total/self.population
            for agent in self.agents: 
                agent.wealth=each_wealth
            self.agents.shuffle_do("step")

        elif self.policy=="innovation": 
            bins = start_up_required(self)
            if self.start_up_required==1: 
                self.initial_capital = bins[0]
            elif self.start_up_required==2: 
                mid = len(bins) // 2
                self.initial_capital =bins[mid]
            else:
                self.initial_capital =bins[-1]
            self.agents.shuffle_do("step")
             
        self.datacollector.collect(self)
        
       