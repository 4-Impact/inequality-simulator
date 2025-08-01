// Inequality Simulator Frontend JavaScript
// Vanilla JS implementation without React

class InequalitySimulator {
    constructor() {
        // Dynamic API base URL detection
        const hostname = window.location.hostname;
        const protocol = window.location.protocol;
        const isGitHubPages = hostname.includes('github.io');
        const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
        const isOnRender = hostname.includes('onrender.com');
        
        if (isGitHubPages) {
            // Try real backend first, fallback to mock if needed
            this.apiBase = 'https://inequality-simulator.onrender.com/api';
            this.useMockBackend = false;
        } else if (isOnRender) {
            // When deployed on Render, use relative paths (same domain)
            this.apiBase = '/api';
            this.useMockBackend = false;
        } else if (isLocalhost) {
            // Local development on laptop
            this.apiBase = 'http://localhost:5000/api';
            this.useMockBackend = false;
        } else {
            // Local network access (for mobile testing)
            // Use HTTPS if the page is served over HTTPS, otherwise HTTP
            const apiProtocol = protocol === 'https:' ? 'https:' : 'http:';
            this.apiBase = `${apiProtocol}//192.168.50.4:5000/api`;
            this.useMockBackend = false;
        }
        
        // Initialize mock backend if needed
        if (this.useMockBackend) {
            this.initializeMockBackend();
            console.log('Using mock backend for GitHub Pages');
            // Update UI to show mock backend status
            setTimeout(() => {
                const backendStatus = document.getElementById('backend-status');
                if (backendStatus) {
                    backendStatus.textContent = 'Mock (Browser-based)';
                    backendStatus.style.color = '#ff9800'; // Orange color for mock
                }
            }, 100);
        } else {
            console.log('Using real backend at:', this.apiBase);
            // Update UI to show real backend attempt
            setTimeout(() => {
                const backendStatus = document.getElementById('backend-status');
                if (backendStatus) {
                    backendStatus.textContent = 'Connecting...';
                    backendStatus.style.color = '#2196f3'; // Blue for connecting
                }
            }, 100);
            
            // Test the backend connection immediately
            this.testBackendConnection();
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
    
    async testBackendConnection() {
        try {
            console.log('Testing backend connection...');
            const response = await fetch(`${this.apiBase}/status`, {
                method: 'GET',
                mode: 'cors',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('Backend connection successful:', data);
                const backendStatus = document.getElementById('backend-status');
                if (backendStatus) {
                    backendStatus.textContent = 'Connected';
                    backendStatus.style.color = '#4caf50'; // Green for connected
                }
            } else {
                throw new Error(`Status check failed: ${response.status}`);
            }
        } catch (error) {
            console.error('Backend connection test failed:', error);
            const backendStatus = document.getElementById('backend-status');
            if (backendStatus) {
                backendStatus.textContent = 'Connection Failed';
                backendStatus.style.color = '#f44336'; // Red for failed
            }
            
            // If we're on GitHub Pages, enable fallback to mock
            const hostname = window.location.hostname;
            if (hostname.includes('github.io')) {
                console.log('Enabling mock backend fallback...');
                // Don't immediately switch to mock, let individual API calls handle the fallback
            }
        }
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
        // For GitHub Pages, try real backend first, then fallback to mock
        if (this.useMockBackend) {
            return await this.mockApiCall(endpoint, method, data);
        }
        
        try {
            console.log(`API Call: ${method} ${this.apiBase}${endpoint}`);
            
            const options = {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                },
                mode: 'cors'  // Explicitly set CORS mode
            };
            
            if (data) {
                options.body = JSON.stringify(data);
                console.log('Request data:', data);
            }

            const response = await fetch(`${this.apiBase}${endpoint}`, options);
            
            console.log(`Response status: ${response.status} ${response.statusText}`);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Response error text:', errorText);
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
            }
            
            const result = await response.json();
            console.log('Response data:', result);
            return result;
        } catch (error) {
            console.error('API call failed:', error);
            console.error('Error details:', {
                endpoint: endpoint,
                method: method,
                apiBase: this.apiBase,
                error: error.message
            });
            
            // If on GitHub Pages and real API fails, fallback to mock
            const hostname = window.location.hostname;
            if (hostname.includes('github.io') && !this.useMockBackend) {
                console.warn('Real backend failed, falling back to mock backend:', error.message);
                this.useMockBackend = true;
                this.initializeMockBackend();
                // Update UI to show fallback status
                const backendStatus = document.getElementById('backend-status');
                if (backendStatus) {
                    backendStatus.textContent = 'Mock (Fallback)';
                    backendStatus.style.color = '#ff5722'; // Red-orange for fallback
                }
                return await this.mockApiCall(endpoint, method, data);
            }
            this.showError(`API Error: ${error.message}`);
            throw error;
        }
    }

    initializeMockBackend() {
        // Initialize mock data storage
        this.mockData = {
            model: null,
            step: 0,
            giniHistory: [],
            totalWealthHistory: [],
            initialized: false
        };
    }

    async mockApiCall(endpoint, method = 'GET', data = null) {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 100));
        
        switch (endpoint) {
            case '/status':
                return {
                    initialized: this.mockData.initialized,
                    policy: this.mockData.model?.policy || null,
                    population: this.mockData.model?.population || null,
                    step_count: this.mockData.step
                };
                
            case '/initialize':
                if (method === 'POST') {
                    this.mockData.model = {
                        policy: data.policy || 'econophysics',
                        population: data.population || 200,
                        start_up_required: data.start_up_required || 1
                    };
                    this.mockData.initialized = true;
                    this.mockData.step = 0;
                    this.mockData.giniHistory = [];
                    this.mockData.totalWealthHistory = [];
                    return { status: 'success', message: 'Model initialized' };
                }
                break;
                
            case '/step':
                if (method === 'POST' && this.mockData.initialized) {
                    this.mockData.step += 1;
                    // Generate mock gini and total wealth data
                    const gini = 0.3 + Math.random() * 0.4; // Random gini between 0.3-0.7
                    const totalWealth = 1000 + this.mockData.step * 10 + Math.random() * 100;
                    this.mockData.giniHistory.push(gini);
                    this.mockData.totalWealthHistory.push(totalWealth);
                    return { status: 'success' };
                }
                break;
                
            case '/data/wealth-distribution':
                if (this.mockData.initialized) {
                    // Generate mock wealth distribution
                    const population = this.mockData.model.population;
                    const wealthData = [];
                    for (let i = 0; i < population; i++) {
                        // Generate wealth with power law distribution (realistic inequality)
                        const wealth = Math.pow(Math.random(), 2) * 1000;
                        wealthData.push(wealth);
                    }
                    return { current: wealthData };
                }
                break;
                
            case '/data/mobility':
                if (this.mockData.initialized) {
                    const population = this.mockData.model.population;
                    const classes = ['Lower', 'Middle', 'Upper'];
                    
                    if (this.mockData.model.policy === 'comparison') {
                        // Return comparison data structure
                        const policies = ['econophysics', 'powerful leaders', 'equal wealth distribution', 'innovation'];
                        const comparisonData = {};
                        
                        policies.forEach(policy => {
                            const policyData = [];
                            for (let i = 0; i < Math.floor(population / policies.length); i++) {
                                policyData.push({
                                    bracket: classes[Math.floor(Math.random() * 3)],
                                    mobility: Math.random(), // 0 to 1 for Bartholomew ratio
                                    wealth: Math.pow(Math.random(), 2) * 1000,
                                    policy: policy
                                });
                            }
                            comparisonData[policy] = policyData;
                        });
                        
                        return comparisonData;
                    } else {
                        // Single policy data structure
                        const mobilityData = [];
                        for (let i = 0; i < population; i++) {
                            mobilityData.push({
                                bracket: classes[Math.floor(Math.random() * 3)],
                                mobility: Math.random(), // 0 to 1 for Bartholomew ratio
                                wealth: Math.pow(Math.random(), 2) * 1000,
                                policy: this.mockData.model.policy
                            });
                        }
                        return mobilityData;
                    }
                }
                break;
                
            case '/data/gini':
                if (this.mockData.initialized) {
                    return { current: this.mockData.giniHistory };
                }
                break;
                
            case '/data/total-wealth':
                if (this.mockData.initialized) {
                    return { current: this.mockData.totalWealthHistory };
                }
                break;
        }
        
        throw new Error(`Mock API endpoint not implemented: ${endpoint}`);
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
            
            // Update backend status to show successful connection
            if (!this.useMockBackend) {
                const backendStatus = document.getElementById('backend-status');
                if (backendStatus) {
                    backendStatus.textContent = 'Real API (Connected)';
                    backendStatus.style.color = '#4caf50'; // Green for connected
                }
            }
            
            this.isInitialized = status.initialized;
            this.updateButtonStates();
        } catch (error) {
            document.getElementById('status-text').textContent = 'Connection Error';
        }
    }

    updateButtonStates() {
        const stepBtn = document.getElementById('step-btn');
        const continuousRunBtn = document.getElementById('continuous-run-btn');
        const stopBtn = document.getElementById('stop-btn');
        
        const canRun = this.isInitialized && !this.isRunning && !this.isContinuousRunning;
        
        stepBtn.disabled = !canRun;
        continuousRunBtn.disabled = !canRun;
        
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
        this.charts.wealth = this.createHistogramChart('wealth-chart');
        this.charts.mobility = this.createScatterChart('mobility-chart');
        this.charts.gini = this.createLineChart('gini-chart');
        this.charts.totalWealth = this.createLineChart('total-wealth-chart');
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
                        ticks: { 
                            color: '#e0e0e0',
                            maxRotation: 45,
                            minRotation: 45
                        },
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
        
        // Create bin labels with exponential notation
        for (let i = 0; i < bins; i++) {
            const start = min + (i * binWidth);
            const end = start + binWidth;
            labels.push(`${start.toExponential(1)}-${end.toExponential(1)}`);
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
                    
                    // Create consistent bin labels with exponential notation
                    const labels = [];
                    for (let i = 0; i < bins; i++) {
                        const start = min + (i * binWidth);
                        const end = start + binWidth;
                        labels.push(`${start.toExponential(1)}-${end.toExponential(1)}`);
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
            
            // Check if this is comparison mode (data is an object with policy keys)
            const isComparisonMode = data && typeof data === 'object' && !Array.isArray(data) && 
                                    Object.keys(data).some(key => ['econophysics', 'powerful leaders', 'equal wealth distribution', 'innovation'].includes(key));
            
            if (isComparisonMode) {
                // Comparison mode: color by policy
                const policyColors = {
                    'econophysics': 'rgba(54, 162, 235, 0.7)',           // Blue
                    'powerful leaders': 'rgba(255, 99, 132, 0.7)',      // Red
                    'equal wealth distribution': 'rgba(75, 192, 192, 0.7)', // Teal
                    'innovation': 'rgba(255, 159, 64, 0.7)'             // Orange
                };
                
                const classToY = { 'Lower': 0, 'Middle': 1, 'Upper': 2 };
                const datasets = {};
                let totalAgents = 0;
                
                // Count total agents for position calculation
                Object.values(data).forEach(policyData => {
                    totalAgents += policyData.length;
                });
                
                let agentIndex = 0;
                
                // Process each policy's data
                Object.keys(data).forEach(policy => {
                    const policyData = data[policy];
                    
                    if (!datasets[policy]) {
                        datasets[policy] = {
                            label: policy,
                            data: [],
                            backgroundColor: policyColors[policy] || 'rgba(128, 128, 128, 0.7)',
                            borderColor: (policyColors[policy] || 'rgba(128, 128, 128, 0.7)').replace('0.7', '1'),
                            pointRadius: []
                        };
                    }
                    
                    policyData.forEach((agent) => {
                        const agentId = agentIndex; // Use global agent index
                        
                        // Assign fixed x position if not already assigned
                        if (!(agentId in this.agentPositions)) {
                            // Spread agents evenly across the x-axis
                            this.agentPositions[agentId] = (agentIndex / totalAgents) * 50;
                        }
                        
                        datasets[policy].data.push({
                            x: this.agentPositions[agentId],
                            y: classToY[agent.bracket]
                        });
                        
                        // Size based on Bartholomew mobility ratio (0 to 1)
                        const size = 5 + (agent.mobility * 15); // Size from 5 to 20
                        datasets[policy].pointRadius.push(size);
                        
                        agentIndex++;
                    });
                });
                
                this.charts.mobility.data.datasets = Object.values(datasets);
            } else {
                // Single policy mode: color by class (original behavior)
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
                    
                    // Size based on Bartholomew mobility ratio (0 to 1)
                    // Scale to make differences more visible
                    const size = 5 + (agent.mobility * 15); // Size from 5 to 20
                    datasets[className].pointRadius.push(size);
                });
                
                this.charts.mobility.data.datasets = Object.values(datasets);
            }
            
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
        await simulator.apiCall('/step', 'POST', {});
        simulator.stepCount++; // Increment step counter
        await simulator.refreshCharts(true); // Use incremental updates
    } catch (error) {
        console.error('Error stepping model:', error);
    } finally {
        simulator.isRunning = false;
        simulator.updateButtonStates();
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
            await simulator.apiCall('/step', 'POST', {});
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
