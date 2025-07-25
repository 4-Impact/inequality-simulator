// Inequality Simulator Frontend JavaScript
// Vanilla JS implementation without React

class InequalitySimulator {
    constructor() {
        // Dynamic API base URL detection
        const hostname = window.location.hostname;
        const isGitHubPages = hostname.includes('github.io');
        const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
        
        if (isGitHubPages) {
            // Use deployed backend URL - REPLACE WITH YOUR ACTUAL RENDER URL
            this.apiBase = 'https://YOUR-ACTUAL-RENDER-URL.onrender.com/api';
        } else if (isLocalhost) {
            // Local development on laptop
            this.apiBase = 'http://localhost:5000/api';
        } else {
            // Local network access (for mobile testing) - using your laptop's IP
            this.apiBase = 'http://192.168.50.4:5000/api';
        }
        
        this.charts = {};
        this.isInitialized = false;
        this.isRunning = false;
        this.isContinuousRunning = false;
        this.continuousRunInterval = null;
        this.stepCount = 0; // Track current step for incremental updates
        this.agentPositions = {}; // Store fixed x positions for agents
        
        this.initializeCharts();
        this.updateStatus();
        
        // Poll status every 2 seconds
        setInterval(() => this.updateStatus(), 2000);
        
        // Clean up on page unload
        window.addEventListener('beforeunload', () => {
            this.stopContinuousRun();
        });
    }
    
    stopContinuousRun() {
        if (this.isContinuousRunning && this.continuousRunInterval) {
            this.isContinuousRunning = false;
            clearInterval(this.continuousRunInterval);
            this.continuousRunInterval = null;
            this.updateButtonStates();
        }
    }
    
    resetCharts() {
        // Clear all chart data
        this.stepCount = 0;
        this.agentPositions = {}; // Reset agent positions
        
        // Reset line charts (Gini and Total Wealth)
        this.charts.gini.data.labels = [];
        this.charts.gini.data.datasets = [{
            label: 'Gini Coefficient',
            data: [],
            borderColor: 'rgba(54, 162, 235, 1)',
            backgroundColor: 'rgba(54, 162, 235, 0.1)',
            tension: 0.1
        }];
        this.charts.gini.update();
        
        this.charts.totalWealth.data.labels = [];
        this.charts.totalWealth.data.datasets = [{
            label: 'Total Wealth',
            data: [],
            borderColor: 'rgba(75, 192, 192, 1)',
            backgroundColor: 'rgba(75, 192, 192, 0.1)',
            tension: 0.1
        }];
        this.charts.totalWealth.update();
        
        // Reset histogram and scatter plots
        this.charts.wealth.data.labels = [];
        this.charts.wealth.data.datasets = [];
        this.charts.wealth.update();
        
        this.charts.mobility.data.datasets = [];
        this.charts.mobility.update();
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
        const continuousRunBtn = document.getElementById('continuous-run-btn');
        const stopBtn = document.getElementById('stop-btn');
        const refreshBtn = document.getElementById('refresh-btn');
        
        const canRun = this.isInitialized && !this.isRunning && !this.isContinuousRunning;
        
        stepBtn.disabled = !canRun;
        runBtn.disabled = !canRun;
        continuousRunBtn.disabled = !canRun;
        refreshBtn.disabled = !this.isInitialized || this.isRunning;
        
        // Show/hide stop button
        if (this.isContinuousRunning) {
            continuousRunBtn.style.display = 'none';
            stopBtn.style.display = 'inline-block';
            stopBtn.disabled = false;
        } else {
            continuousRunBtn.style.display = 'inline-block';
            stopBtn.style.display = 'none';
        }
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
                        text: title,
                        color: '#e0e0e0'
                    },
                    legend: {
                        display: true,
                        labels: { color: '#e0e0e0' }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#e0e0e0' },
                        grid: { color: 'rgba(224, 224, 224, 0.1)' }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { color: '#e0e0e0' },
                        grid: { color: 'rgba(224, 224, 224, 0.1)' }
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
                        text: title,
                        color: '#e0e0e0'
                    },
                    legend: {
                        display: true,
                        labels: { color: '#e0e0e0' }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Position',
                            color: '#e0e0e0'
                        },
                        ticks: { color: '#e0e0e0' },
                        grid: { color: 'rgba(224, 224, 224, 0.1)' }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Economic Class',
                            color: '#e0e0e0'
                        },
                        ticks: { 
                            color: '#e0e0e0',
                            callback: function(value) {
                                const labels = ['Lower', 'Middle', 'Upper'];
                                return labels[value] || value;
                            }
                        },
                        grid: { color: 'rgba(224, 224, 224, 0.1)' }
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
                        text: title,
                        color: '#e0e0e0'
                    },
                    legend: {
                        display: true,
                        labels: { color: '#e0e0e0' }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#e0e0e0' },
                        grid: { color: 'rgba(224, 224, 224, 0.1)' }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { color: '#e0e0e0' },
                        grid: { color: 'rgba(224, 224, 224, 0.1)' }
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
                // Comparison data - overlay histograms
                const policies = Object.keys(data);
                const colors = ['rgba(54, 162, 235, 0.5)', 'rgba(255, 99, 132, 0.5)', 
                              'rgba(75, 192, 192, 0.5)', 'rgba(255, 159, 64, 0.5)'];
                
                // Find the overall range across all policies for consistent binning
                let allValues = [];
                policies.forEach(policy => {
                    allValues = allValues.concat(data[policy]);
                });
                
                if (allValues.length > 0) {
                    const min = Math.min(...allValues);
                    const max = Math.max(...allValues);
                    const bins = 15;
                    const binWidth = (max - min) / bins;
                    
                    // Create consistent bin labels
                    const labels = [];
                    for (let i = 0; i < bins; i++) {
                        const start = min + (i * binWidth);
                        const end = start + binWidth;
                        labels.push(`${start.toFixed(1)}-${end.toFixed(1)}`);
                    }
                    
                    // Create datasets for each policy using the same bins
                    const datasets = policies.map((policy, index) => {
                        const counts = new Array(bins).fill(0);
                        
                        // Count data points in each bin for this policy
                        data[policy].forEach(value => {
                            let binIndex = Math.floor((value - min) / binWidth);
                            if (binIndex >= bins) binIndex = bins - 1;
                            if (binIndex < 0) binIndex = 0;
                            counts[binIndex]++;
                        });
                        
                        return {
                            label: policy,
                            data: counts,
                            backgroundColor: colors[index % colors.length],
                            borderColor: colors[index % colors.length].replace('0.5', '1'),
                            borderWidth: 1
                        };
                    });
                    
                    this.charts.wealth.data.labels = labels;
                    this.charts.wealth.data.datasets = datasets;
                } else {
                    // No data available
                    this.charts.wealth.data.labels = [];
                    this.charts.wealth.data.datasets = [];
                }
            }
            
            this.charts.wealth.update('none'); // Faster update mode
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
            const totalAgents = data.length;
            
            data.forEach((agent, index) => {
                const className = agent.bracket;
                const agentId = index; // Use array index as agent ID
                
                // Assign fixed x position if not already assigned
                if (!(agentId in this.agentPositions)) {
                    // Spread agents evenly across the x-axis
                    this.agentPositions[agentId] = (index / totalAgents) * 50;
                }
                
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
                    x: this.agentPositions[agentId], // Use fixed x position
                    y: classToY[className]
                });
                
                // Size based on mobility (sqrt scaling)
                const size = 5 + Math.sqrt(agent.mobility + 1) * 2;
                datasets[className].pointRadius.push(size);
            });
            
            this.charts.mobility.data.datasets = Object.values(datasets);
            this.charts.mobility.update('none'); // Faster update mode
        } catch (error) {
            console.error('Error updating mobility chart:', error);
        }
    }

    async updateGiniChart(incremental = false) {
        try {
            const data = await this.apiCall('/data/gini');
            
            if (data.current) {
                // Single policy data
                if (incremental && data.current.length > 0) {
                    // Add only the latest data point
                    const latestGini = data.current[data.current.length - 1];
                    this.charts.gini.data.labels.push(this.stepCount);
                    this.charts.gini.data.datasets[0].data.push(latestGini);
                    
                    // Keep only last 100 points for performance
                    if (this.charts.gini.data.labels.length > 100) {
                        this.charts.gini.data.labels.shift();
                        this.charts.gini.data.datasets[0].data.shift();
                    }
                } else {
                    // Full update (for initialization or refresh)
                    const labels = data.current.map((_, index) => index);
                    this.charts.gini.data.labels = labels;
                    this.charts.gini.data.datasets[0].data = data.current;
                    this.stepCount = data.current.length - 1;
                }
            } else {
                // Comparison data
                const policies = Object.keys(data);
                const colors = ['rgba(54, 162, 235, 1)', 'rgba(255, 99, 132, 1)', 
                              'rgba(75, 192, 192, 1)', 'rgba(255, 159, 64, 1)'];
                
                let maxLength = 0;
                policies.forEach(policy => {
                    maxLength = Math.max(maxLength, data[policy].length);
                });
                
                // For comparison mode, update step count based on max data length
                if (incremental) {
                    this.stepCount = Math.max(this.stepCount, maxLength - 1);
                }
                
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
            
            this.charts.gini.update('none'); // 'none' mode for faster updates
        } catch (error) {
            console.error('Error updating Gini chart:', error);
        }
    }

    async updateTotalWealthChart(incremental = false) {
        try {
            const data = await this.apiCall('/data/total-wealth');
            
            if (data.current) {
                // Single policy data
                if (incremental && data.current.length > 0) {
                    // Add only the latest data point
                    const latestTotal = data.current[data.current.length - 1];
                    this.charts.totalWealth.data.labels.push(this.stepCount);
                    this.charts.totalWealth.data.datasets[0].data.push(latestTotal);
                    
                    // Keep only last 100 points for performance
                    if (this.charts.totalWealth.data.labels.length > 100) {
                        this.charts.totalWealth.data.labels.shift();
                        this.charts.totalWealth.data.datasets[0].data.shift();
                    }
                } else {
                    // Full update (for initialization or refresh)
                    const labels = data.current.map((_, index) => index);
                    this.charts.totalWealth.data.labels = labels;
                    this.charts.totalWealth.data.datasets[0].data = data.current;
                    this.stepCount = Math.max(this.stepCount, data.current.length - 1);
                }
            } else {
                // Comparison data
                const policies = Object.keys(data);
                const colors = ['rgba(54, 162, 235, 1)', 'rgba(255, 99, 132, 1)', 
                              'rgba(75, 192, 192, 1)', 'rgba(255, 159, 64, 1)'];
                
                let maxLength = 0;
                policies.forEach(policy => {
                    maxLength = Math.max(maxLength, data[policy].length);
                });
                
                // For comparison mode, update step count based on max data length
                if (incremental) {
                    this.stepCount = Math.max(this.stepCount, maxLength - 1);
                }
                
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
            
            this.charts.totalWealth.update('none'); // 'none' mode for faster updates
        } catch (error) {
            console.error('Error updating total wealth chart:', error);
        }
    }

    async refreshCharts(incremental = false) {
        if (!this.isInitialized) return;
        
        if (!incremental) {
            document.getElementById('status-text').textContent = 'Updating charts...';
        }
        
        try {
            if (incremental) {
                // For incremental updates, only update line charts incrementally
                // and update other charts normally but with faster rendering
                await Promise.all([
                    this.updateWealthChart(),
                    this.updateMobilityChart(),
                    this.updateGiniChart(true),
                    this.updateTotalWealthChart(true)
                ]);
            } else {
                // Full update for initialization or refresh button
                await Promise.all([
                    this.updateWealthChart(),
                    this.updateMobilityChart(),
                    this.updateGiniChart(false),
                    this.updateTotalWealthChart(false)
                ]);
            }
            
            if (!incremental) {
                document.getElementById('status-text').textContent = 'Ready';
            }
        } catch (error) {
            if (!incremental) {
                document.getElementById('status-text').textContent = 'Error updating charts';
            }
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
        
        // Reset charts for new model
        simulator.resetCharts();
        
        // Wait a moment for initialization to complete
        setTimeout(async () => {
            await simulator.updateStatus();
            await simulator.refreshCharts(false); // Full update for initialization
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
        const steps = parseInt(document.getElementById('steps-input').value) || 50;
        await simulator.apiCall('/step', 'POST', { comparison_steps: steps });
        simulator.stepCount++; // Increment step counter
        await simulator.refreshCharts(true); // Use incremental updates
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
    const steps = parseInt(document.getElementById('steps-input').value) || 50;
    runBtn.textContent = `Running ${steps} steps...`;
    
    try {
        await simulator.apiCall('/run', 'POST', { steps: steps });
        await simulator.refreshCharts();
    } catch (error) {
        console.error('Error running model:', error);
    } finally {
        simulator.isRunning = false;
        simulator.updateButtonStates();
        runBtn.textContent = originalText;
    }
}

async function startContinuousRun() {
    if (!simulator.isInitialized || simulator.isContinuousRunning) return;
    
    simulator.isContinuousRunning = true;
    simulator.updateButtonStates();
    
    document.getElementById('status-text').textContent = 'Running Continuously...';
    
    // Run one step every 500ms (0.5 seconds)
    simulator.continuousRunInterval = setInterval(async () => {
        if (!simulator.isContinuousRunning) {
            clearInterval(simulator.continuousRunInterval);
            return;
        }
        
        try {
            const steps = parseInt(document.getElementById('steps-input').value) || 50;
            await simulator.apiCall('/step', 'POST', { comparison_steps: steps });
            simulator.stepCount++; // Increment step counter
            await simulator.refreshCharts(true); // Use incremental updates
        } catch (error) {
            console.error('Error in continuous run:', error);
            stopContinuousRun();
        }
    }, 500);
}

async function stopContinuousRun() {
    simulator.stopContinuousRun();
    document.getElementById('status-text').textContent = 'Ready';
}

async function refreshCharts() {
    if (!simulator.isInitialized) return;
    await simulator.refreshCharts();
}
