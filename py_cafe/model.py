import mesa
import numpy as np
from scipy.stats import expon
from mesa.visualization.utils import update_counter
from mesa.visualization import SolaraViz, make_plot_component
import solara 
from matplotlib.figure import Figure
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
    wealth_vals = [agent.wealth for agent in model.agents]
    # Note: you have to use Matplotlib's OOP API instead of plt.hist
    # because plt.hist is not thread-safe.
    ax.hist(wealth_vals, bins=10)
    solara.FigureMatplotlib(fig)

@solara.component
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

def compute_gini(model):
    agent_wealths = [abs(float(agent.wealth)) for agent in model.agents]
    x = sorted(agent_wealths)
    N = model.population
    B = sum(xi * (N - i) for i, xi in enumerate(x)) / (N * sum(x))
    return 1 + (1 / N) - 2 * B

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
        most = max([agent.wealth for agent in self.model.agents])
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
        
        self.datacollector = mesa.DataCollector(model_reporters = {"Gini": compute_gini,"Total": total_wealth },
                                               agent_reporters={"Wealth":"wealth", "Bracket":"bracket","Pay":"W" })
        
        
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
    
    def step(self):
        self.brackets = calc_brackets(self)
        self.total = total_wealth(self)
        #Deternine survival cost based on inflation
        exp_scale = np.mean([agent.wealth for agent in self.agents])
        self.survival_cost = expon.ppf(0.1, scale=exp_scale)
        if self.policy=="econophysics": 
            self.agents.shuffle_do("step")
        
        # party_elites can only receive from subordinates but never give money
        if self.policy=="powerful leaders": 
            subordinates = self.agents.select(lambda a: a.party_elite==False)
            subordinates.shuffle_do("step")
        
        # Divide the wealth equally among all agents at the beginning of the time step
        if self.policy=="equal wealth distribution": 
            each_wealth = self.total/self.population
            for agent in self.agents: 
                agent.wealth=each_wealth
            self.agents.shuffle_do("step")

        if self.policy=="innovation": 
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
        
       