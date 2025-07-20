// Inequality Simulator Frontend JavaScript
// Vanilla JS implementation without React

class InequalitySimulator {
    constructor() {
        this.apiBase = 'http://localhost:5000/api';
        this.charts = {};
        this.isInitialized = false;
        this.isRunning = false;
        
        this.initializeCharts();
        this.updateStatus();
        
        // Poll status every 2 seconds
        setInterval(() => this.updateStatus(), 2000);
    }

    async apiCall(endpoint, method = 'GET', data = null) {
        try {
            const options = {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                }
            };
            
            if (data) {
                options.body = JSON.stringify(data);
            }

            const response = await fetch(`${this.apiBase}${endpoint}`, options);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            this.showError(`API Error: ${error.message}`);
            throw error;
        }
    }

    showError(message) {
        const errorDiv = document.getElementById('error-message');
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    }

    async updateStatus() {
        try {
            const status = await this.apiCall('/status');
            document.getElementById('status-text').textContent = status.initialized ? 'Ready' : 'Not Initialized';
            document.getElementById('status-policy').textContent = status.policy || '-';
            document.getElementById('status-population').textContent = status.population || '-';
            
            this.isInitialized = status.initialized;
            this.updateButtonStates();
        } catch (error) {
            document.getElementById('status-text').textContent = 'Connection Error';
        }
    }

    updateButtonStates() {
        const stepBtn = document.getElementById('step-btn');
        const runBtn = document.getElementById('run-btn');
        const refreshBtn = document.getElementById('refresh-btn');
        
        stepBtn.disabled = !this.isInitialized || this.isRunning;
        runBtn.disabled = !this.isInitialized || this.isRunning;
        refreshBtn.disabled = !this.isInitialized || this.isRunning;
    }

    initializeCharts() {
        // Initialize all charts with empty data
        this.charts.wealth = this.createHistogramChart('wealth-chart', 'Wealth Distribution');
        this.charts.mobility = this.createScatterChart('mobility-chart', 'Economic Mobility');
        this.charts.gini = this.createLineChart('gini-chart', 'Gini Coefficient');
        this.charts.totalWealth = this.createLineChart('total-wealth-chart', 'Total Wealth');
    }

    createHistogramChart(canvasId, title) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        return new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: []
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: title
                    },
                    legend: {
                        display: true
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }

    createScatterChart(canvasId, title) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        return new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: []
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: title
                    },
                    legend: {
                        display: true
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Position'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Economic Class'
                        },
                        ticks: {
                            callback: function(value) {
                                const labels = ['Lower', 'Middle', 'Upper'];
                                return labels[value] || value;
                            }
                        }
                    }
                }
            }
        });
    }

    createLineChart(canvasId, title) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        return new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: []
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: title
                    },
                    legend: {
                        display: true
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }

    createHistogram(data, bins = 15) {
        if (!data || data.length === 0) return { labels: [], counts: [] };
        
        const min = Math.min(...data);
        const max = Math.max(...data);
        const binWidth = (max - min) / bins;
        
        const labels = [];
        const counts = new Array(bins).fill(0);
        
        // Create bin labels
        for (let i = 0; i < bins; i++) {
            const start = min + (i * binWidth);
            const end = start + binWidth;
            labels.push(`${start.toFixed(1)}-${end.toFixed(1)}`);
        }
        
        // Count data points in each bin
        data.forEach(value => {
            let binIndex = Math.floor((value - min) / binWidth);
            if (binIndex >= bins) binIndex = bins - 1;
            if (binIndex < 0) binIndex = 0;
            counts[binIndex]++;
        });
        
        return { labels, counts };
    }

    async updateWealthChart() {
        try {
            const data = await this.apiCall('/data/wealth-distribution');
            
            if (data.current) {
                // Single policy data
                const histogram = this.createHistogram(data.current);
                this.charts.wealth.data.labels = histogram.labels;
                this.charts.wealth.data.datasets = [{
                    label: 'Frequency',
                    data: histogram.counts,
                    backgroundColor: 'rgba(54, 162, 235, 0.6)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1
                }];
            } else {
                // Comparison data
                const policies = Object.keys(data);
                const colors = ['rgba(54, 162, 235, 0.6)', 'rgba(255, 99, 132, 0.6)', 
                              'rgba(75, 192, 192, 0.6)', 'rgba(255, 159, 64, 0.6)'];
                
                let allLabels = new Set();
                const datasets = [];
                
                policies.forEach((policy, index) => {
                    const histogram = this.createHistogram(data[policy]);
                    histogram.labels.forEach(label => allLabels.add(label));
                    
                    datasets.push({
                        label: policy,
                        data: histogram.counts,
                        backgroundColor: colors[index % colors.length],
                        borderColor: colors[index % colors.length].replace('0.6', '1'),
                        borderWidth: 1
                    });
                });
                
                this.charts.wealth.data.labels = Array.from(allLabels).sort();
                this.charts.wealth.data.datasets = datasets;
            }
            
            this.charts.wealth.update();
        } catch (error) {
            console.error('Error updating wealth chart:', error);
        }
    }

    async updateMobilityChart() {
        try {
            const data = await this.apiCall('/data/mobility');
            
            const classToY = { 'Lower': 0, 'Middle': 1, 'Upper': 2 };
            const classToColor = { 
                'Lower': 'rgba(255, 99, 132, 0.7)', 
                'Middle': 'rgba(54, 162, 235, 0.7)', 
                'Upper': 'rgba(75, 192, 192, 0.7)' 
            };
            
            const datasets = {};
            
            data.forEach((agent, index) => {
                const className = agent.bracket;
                if (!datasets[className]) {
                    datasets[className] = {
                        label: className,
                        data: [],
                        backgroundColor: classToColor[className],
                        borderColor: classToColor[className].replace('0.7', '1'),
                        pointRadius: []
                    };
                }
                
                datasets[className].data.push({
                    x: Math.random() * 50, // Random x position for scatter
                    y: classToY[className]
                });
                
                // Size based on mobility (sqrt scaling)
                const size = 5 + Math.sqrt(agent.mobility + 1) * 2;
                datasets[className].pointRadius.push(size);
            });
            
            this.charts.mobility.data.datasets = Object.values(datasets);
            this.charts.mobility.update();
        } catch (error) {
            console.error('Error updating mobility chart:', error);
        }
    }

    async updateGiniChart() {
        try {
            const data = await this.apiCall('/data/gini');
            
            if (data.current) {
                // Single policy data
                const labels = data.current.map((_, index) => index);
                this.charts.gini.data.labels = labels;
                this.charts.gini.data.datasets = [{
                    label: 'Gini Coefficient',
                    data: data.current,
                    borderColor: 'rgba(54, 162, 235, 1)',
                    backgroundColor: 'rgba(54, 162, 235, 0.1)',
                    tension: 0.1
                }];
            } else {
                // Comparison data
                const policies = Object.keys(data);
                const colors = ['rgba(54, 162, 235, 1)', 'rgba(255, 99, 132, 1)', 
                              'rgba(75, 192, 192, 1)', 'rgba(255, 159, 64, 1)'];
                
                let maxLength = 0;
                policies.forEach(policy => {
                    maxLength = Math.max(maxLength, data[policy].length);
                });
                
                const labels = Array.from({length: maxLength}, (_, i) => i);
                
                const datasets = policies.map((policy, index) => ({
                    label: policy,
                    data: data[policy],
                    borderColor: colors[index % colors.length],
                    backgroundColor: colors[index % colors.length].replace('1)', '0.1)'),
                    tension: 0.1
                }));
                
                this.charts.gini.data.labels = labels;
                this.charts.gini.data.datasets = datasets;
            }
            
            this.charts.gini.update();
        } catch (error) {
            console.error('Error updating Gini chart:', error);
        }
    }

    async updateTotalWealthChart() {
        try {
            const data = await this.apiCall('/data/total-wealth');
            
            if (data.current) {
                // Single policy data
                const labels = data.current.map((_, index) => index);
                this.charts.totalWealth.data.labels = labels;
                this.charts.totalWealth.data.datasets = [{
                    label: 'Total Wealth',
                    data: data.current,
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    tension: 0.1
                }];
            } else {
                // Comparison data
                const policies = Object.keys(data);
                const colors = ['rgba(54, 162, 235, 1)', 'rgba(255, 99, 132, 1)', 
                              'rgba(75, 192, 192, 1)', 'rgba(255, 159, 64, 1)'];
                
                let maxLength = 0;
                policies.forEach(policy => {
                    maxLength = Math.max(maxLength, data[policy].length);
                });
                
                const labels = Array.from({length: maxLength}, (_, i) => i);
                
                const datasets = policies.map((policy, index) => ({
                    label: policy,
                    data: data[policy],
                    borderColor: colors[index % colors.length],
                    backgroundColor: colors[index % colors.length].replace('1)', '0.1)'),
                    tension: 0.1
                }));
                
                this.charts.totalWealth.data.labels = labels;
                this.charts.totalWealth.data.datasets = datasets;
            }
            
            this.charts.totalWealth.update();
        } catch (error) {
            console.error('Error updating total wealth chart:', error);
        }
    }

    async refreshCharts() {
        if (!this.isInitialized) return;
        
        document.getElementById('status-text').textContent = 'Updating charts...';
        
        try {
            await Promise.all([
                this.updateWealthChart(),
                this.updateMobilityChart(),
                this.updateGiniChart(),
                this.updateTotalWealthChart()
            ]);
            
            document.getElementById('status-text').textContent = 'Ready';
        } catch (error) {
            document.getElementById('status-text').textContent = 'Error updating charts';
        }
    }
}

// Global instance
let simulator;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    simulator = new InequalitySimulator();
});

// Global functions for button clicks
async function initializeModel() {
    const policy = document.getElementById('policy-select').value;
    const population = parseInt(document.getElementById('population-input').value);
    const startupRequired = parseInt(document.getElementById('startup-select').value);
    
    const initBtn = document.getElementById('initialize-btn');
    initBtn.disabled = true;
    initBtn.textContent = 'Initializing...';
    
    try {
        await simulator.apiCall('/initialize', 'POST', {
            policy: policy,
            population: population,
            start_up_required: startupRequired
        });
        
        // Wait a moment for initialization to complete
        setTimeout(async () => {
            await simulator.updateStatus();
            await simulator.refreshCharts();
            initBtn.textContent = 'Initialize Model';
            initBtn.disabled = false;
        }, 1000);
        
    } catch (error) {
        initBtn.textContent = 'Initialize Model';
        initBtn.disabled = false;
    }
}

async function stepModel() {
    if (!simulator.isInitialized) return;
    
    simulator.isRunning = true;
    simulator.updateButtonStates();
    
    try {
        await simulator.apiCall('/step', 'POST');
        await simulator.refreshCharts();
    } catch (error) {
        console.error('Error stepping model:', error);
    } finally {
        simulator.isRunning = false;
        simulator.updateButtonStates();
    }
}

async function runModel() {
    if (!simulator.isInitialized) return;
    
    simulator.isRunning = true;
    simulator.updateButtonStates();
    
    const runBtn = document.getElementById('run-btn');
    const originalText = runBtn.textContent;
    runBtn.textContent = 'Running...';
    
    try {
        await simulator.apiCall('/run', 'POST', { steps: 50 });
        await simulator.refreshCharts();
    } catch (error) {
        console.error('Error running model:', error);
    } finally {
        simulator.isRunning = false;
        simulator.updateButtonStates();
        runBtn.textContent = originalText;
    }
}

async function refreshCharts() {
    if (!simulator.isInitialized) return;
    await simulator.refreshCharts();
}
