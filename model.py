import mesa
import numpy as np
from scipy.stats import expon
from mesa.visualization.utils import update_counter
from mesa.visualization import SolaraViz, make_plot_component
import solara 
from matplotlib.figure import Figure
import matplotlib.patches as mpatches
import time
from utilities import calculate_churn, number_to_words, calc_brackets

##############################################################################################

                               #Visuals

###############################################################################################

@solara.component
def Histogram(model):
    update_counter.get() # This is required to update the counter
    # Note: you must initialize a figure using this method instead of
    # plt.figure(), for thread safety purpose
    fig = Figure()
    ax = fig.subplots()
    
    if model.policy == "comparison" and hasattr(model, 'comparison_results') and model.comparison_results is not None:
        # Plot all policies' final wealth distributions
        policies = ["econophysics", "powerful leaders", "equal wealth distribution", "innovation"]
        colors = ['blue', 'red', 'green', 'orange']
        
        for i, policy in enumerate(policies):
            if policy in model.comparison_results:
                final_wealth = model.comparison_results[policy]['final_wealth']
                ax.hist(final_wealth, bins=15, alpha=0.6, label=policy, color=colors[i])
        
        ax.set_title('Final Wealth Distribution - All Policies')
        ax.set_xlabel('Wealth')
        ax.set_ylabel('Frequency')
        ax.legend()
    else:
        # Show current model's wealth distribution
        wealth_vals = [agent.wealth for agent in model.agents]
        ax.hist(wealth_vals, bins=10)
        ax.set_title(f'Wealth Distribution - {model.policy}')
        ax.set_xlabel('Wealth')
        ax.set_ylabel('Frequency')
    
    solara.FigureMatplotlib(fig)

@solara.component
def Mobility(model): 
    update_counter.get()

    # --- 1. Pull data from the model ------------------------------------------
    agents   = model.agents              # or however you reference them
    classes  = np.array([a.bracket   for a in agents])
    mobility = np.array([a.mobility  for a in agents])

    # --- 2. Map class → y-coordinate & color -----------------------------------
    class_to_y = {"Lower": 0, "Middle": 1, "Upper": 2}
    y = np.vectorize(class_to_y.get)(classes)
    
    # optional color mapping (comment out if you don’t need colors)
    class_to_color = {"Lower": "tab:red", "Middle": "tab:blue", "Upper": "tab:green"}
    colors = np.vectorize(class_to_color.get)(classes)

    # --- 3. Choose x-positions -------------------------------------------------
    # any scheme works; here we jitter agents within 50 equally-spaced slots
    rng = np.random.default_rng(seed=42)
    x  = rng.uniform(0, 50, size=len(agents))
    # --- 4. Scale mobility to point size --------------------------------------
    # Square-root scaling keeps big numbers from dominating visually
    sizes = 20 * np.sqrt(mobility + 1)  # add 1 so size≠0

    # --- 5. Plot ---------------------------------------------------------------
    fig = Figure()
    ax = fig.subplots()
    ax.scatter(x, y, s=sizes, c=colors, alpha=0.7, edgecolors="k", linewidths=0.5)
    
    # --- 6. Cosmetics ----------------------------------------------------------
    ax.set_xlim(0, 50)
    ax.set_xticks([])                           # hide x ticks if they’re meaningless
    ax.set_yticks([0, 1, 2])
    ax.set_yticklabels(["Lower", "Middle", "Upper"])
    ax.set_title("Agent Economic Class vs. Mobility")

    # Make a legend keyed to class, not size
    for cls, yc in class_to_y.items():
        ax.scatter([], [], s=50, color=class_to_color[cls], label=cls.capitalize())
    ax.legend(title="Class", frameon=False, bbox_to_anchor=(1.05, 1))

    solara.FigureMatplotlib(fig)

'''
def Churn(model): 
    update_counter.get()

    fig = Figure()
    ax = fig.subplots()
    ax.axis('off')
    churn_details = calculate_churn(model)
    ax.text(0.2, 0.8, f"Upper Class: {round((churn_details[2]['Upper']/200)*100,0)}% ", va='center', ha='left', color="green", fontsize=15)
    ax.text(0.2,0.5,f"Middle Class {round((churn_details[2]['Middle']/200)*100,0)}% ",  va='center', ha='left', color="orange", fontsize=15)
    ax.text(0.2, 0.2, f"Lower Class {round((churn_details[2]['Lower']/200)*100,0)}% ", va='center', ha='left', color="red", fontsize=15)
    ax.text(0.6, 0.7, f"Moving Up {round((churn_details[0]/200)*100,2)}%", va='center', ha='left', color="black", fontsize=15)
    ax.text(0.6, 0.3, f"Moving Down {round((churn_details[1]/200)*100,2)}%", va='center', ha='left', color="black", fontsize=15)
    
    solara.FigureMatplotlib(fig)
'''
def compute_gini(model):
    agent_wealths = [abs(float(agent.wealth)) for agent in model.agents]
    x = sorted(agent_wealths)
    N = model.population
    B = sum(xi * (N - i) for i, xi in enumerate(x)) / (N * sum(x))
    return 1 + (1 / N) - 2 * B
'''
@solara.component
def Wealth(model): 
    update_counter.get()
    fig = Figure()
    ax = fig.subplots()
    ax.axis('off')
    total_wealth = sum([agent.wealth for agent in model.agents])
    words = number_to_words(int(total_wealth))
    ax.text(0.0,0.8,f"Total Wealth Using: \n{model.policy} policy", 
             va='center', ha='left', color="black", fontsize=20)
    ax.text(0.5,0.5,f"{words}", 
             va='center', ha='left', color="black", fontsize=20)
    solara.FigureMatplotlib(fig)
'''
def total_wealth(model): 
    return sum([agent.wealth for agent in model.agents])

@solara.component
def GiniPlot(model):
    """Custom Gini plot that shows comparison data when in comparison mode"""
    update_counter.get()
    fig = Figure()
    ax = fig.subplots()
    
    if model.policy == "comparison" and hasattr(model, 'comparison_results') and model.comparison_results is not None:
        # Plot Gini coefficient over time for all policies
        policies = ["econophysics", "powerful leaders", "equal wealth distribution", "innovation"]
        colors = ['blue', 'red', 'green', 'orange']
        
        for i, policy in enumerate(policies):
            if policy in model.comparison_results:
                data = model.comparison_results[policy]
                steps = range(len(data['gini']))
                ax.plot(steps, data['gini'], label=policy, color=colors[i], linewidth=2)
        
        ax.set_title('Gini Coefficient Over Time - All Policies')
        ax.set_xlabel('Time Steps')
        ax.set_ylabel('Gini Coefficient')
        ax.legend()
        ax.grid(True, alpha=0.3)
    else:
        # Show message that comparison data is not available
        ax.text(0.5, 0.5, f"Gini data for {model.policy}\nSelect 'comparison' to see all policies", 
                ha='center', va='center', fontsize=12, transform=ax.transAxes)
        ax.axis('off')
    
    solara.FigureMatplotlib(fig)

@solara.component  
def TotalWealthPlot(model):
    """Custom Total Wealth plot that shows comparison data when in comparison mode"""
    update_counter.get()
    fig = Figure()
    ax = fig.subplots()
    
    if model.policy == "comparison" and hasattr(model, 'comparison_results') and model.comparison_results is not None:
        # Plot total wealth over time for all policies
        policies = ["econophysics", "powerful leaders", "equal wealth distribution", "innovation"]
        colors = ['blue', 'red', 'green', 'orange']
        
        for i, policy in enumerate(policies):
            if policy in model.comparison_results:
                data = model.comparison_results[policy]
                steps = range(len(data['total']))
                ax.plot(steps, data['total'], label=policy, color=colors[i], linewidth=2)
        
        ax.set_title('Total Wealth Over Time - All Policies')
        ax.set_xlabel('Time Steps')
        ax.set_ylabel('Total Wealth')
        ax.legend()
        ax.grid(True, alpha=0.3)
    else:
        # Show message that comparison data is not available
        ax.text(0.5, 0.5, f"Total wealth for {model.policy}\nSelect 'comparison' to see all policies", 
                ha='center', va='center', fontsize=12, transform=ax.transAxes)
        ax.axis('off')
    
    solara.FigureMatplotlib(fig)

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
        self.mobility = 0
        self.W = proportion
        self.I = innovation
        self.ioriginal = innovation
        self.decay = 0
        
        
    def exchange(self): 

        return self.random.choice(self.model.agents)
    
    
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

        if self.bracket == self.previous: 
            self.mobility += 1
        else:
            self.mobility = 0
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
        self.total = 200
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

        # Generate 200 data points from the Gaussian distribution
        payday_array = np.random.normal(mean, np.sqrt(variance), self.population)
        
        
        innovation_array =  np.random.pareto(2.5,size=200)
        '''
        innovation_array = np.random.normal(loc=1,
                                          scale=0.1,
                                          size=self.population)
        '''
        # round array to two decimals
        payday_array = np.around(payday_array, decimals=2)
        party_elite_cut= np.percentile(payday_array, 95)
        
        innovation_array = np.around(innovation_array, decimals=2)
        
        for idx in range(self.population):
            party_elite=False
            if payday_array[idx] >=party_elite_cut: 
                party_elite=True
            WealthAgent(self, float(payday_array[idx]), float(innovation_array[idx]), party_elite)
    
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
        
       