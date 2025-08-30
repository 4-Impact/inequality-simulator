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
        this.previousClassCounts = null; // Store previous class distribution for flow calculation
    this.currentView = 'population';
    this.youIndex = null; // random agent index for person view
    this.youSeed = localStorage.getItem('sim_you_seed') || (Math.random().toString(36).slice(2));
    localStorage.setItem('sim_you_seed', this.youSeed);
    this.cachedRichestIdx = null;
    this.cachedPoorestIdx = null;
    this.cachedRichestWealth = null;
    this.cachedPoorestWealth = null;
        
        this.initializeCharts();
        this.updateStatus();
        
        // Poll status every 2 seconds
        setInterval(() => this.updateStatus(), 2000);
        
        // Clean up on page unload
        window.addEventListener('beforeunload', () => {
            this.stopContinuousRun();
        });

        // View dropdown handler
        const viewSelect = document.getElementById('view-select');
        if (viewSelect) {
            viewSelect.addEventListener('change', (e) => {
                this.setView(e.target.value);
            });
            // Default to person view on load
            viewSelect.value = 'person';
            this.setView('person');
        }

        // Person carousel controls
        const pLeft = document.getElementById('p-arrow-left');
        const pRight = document.getElementById('p-arrow-right');
        this.personOrder = ['card-richest','card-you','card-poorest'];
        this.personIndex = 1;
        const updatePHUD = () => {
            const titles = ['Wealthiest','You','Poorest'];
            const hud = document.getElementById('person-hud');
            if (hud) hud.textContent = `${titles[this.personIndex]} (${this.personIndex+1}/3)`;
        };
        const showP = (i) => {
            const cards = this.personOrder.map(id=>document.getElementById(id));
            this.personIndex = (i+cards.length)%cards.length;
            cards.forEach((el,idx)=> el && el.classList.toggle('active', idx===this.personIndex));
            updatePHUD();
        };
        if (pLeft && pRight) {
            pLeft.addEventListener('click', ()=> showP(this.personIndex-1));
            pRight.addEventListener('click', ()=> showP(this.personIndex+1));
        }
        document.addEventListener('DOMContentLoaded', ()=> showP(1));
    }
    setView(view) {
        this.currentView = view;
        const personView = document.getElementById('person-view');
        const chartCarousel = document.getElementById('chart-carousel');
        if (view === 'person') {
            if (chartCarousel) chartCarousel.style.display = 'none';
            if (personView) personView.style.display = 'block';
            // pick a random agent index once per model init
            if (this.youIndex == null && this.isInitialized) {
                const popText = document.getElementById('status-population')?.textContent;
                const pop = parseInt(popText || '0');
                if (pop > 0) this.youIndex = Math.floor(Math.random() * pop);
            }
            this.updatePersonView();
        } else {
            if (personView) personView.style.display = 'none';
            if (chartCarousel) chartCarousel.style.display = 'block';
        }
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
        this.previousClassCounts = null; // Reset previous class counts for flow calculation
    this.youIndex = null; // reset chosen person on re-init
    // keep youSeed stable across inits
    this.cachedRichestIdx = null;
    this.cachedPoorestIdx = null;
        
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
            // keep person view updated if visible
            if (this.currentView === 'person' && this.isInitialized) {
                this.updatePersonView();
            }
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
                        display: false, // Disabled since title is now in HTML
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
    /*
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
                        display: false, // Disabled since title is now in HTML
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
    */
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
                        display: false, // Disabled since title is now in HTML
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

    drawClassFlows(chart) {
        if (!this.flowData) return;
        
        const ctx = chart.ctx;
        const chartArea = chart.chartArea;
        const xScale = chart.scales.x;
        const yScale = chart.scales.y;
        
        // Clear the entire canvas first
        ctx.clearRect(0, 0, chart.canvas.width, chart.canvas.height);
        
        // Redraw the chart background (this is needed after clearing)
        chart.draw();
        
        // Class positions
        const classes = ['Lower', 'Middle', 'Upper'];
        const classY = classes.map((_, i) => yScale.getPixelForValue(i));
        const leftX = xScale.getPixelForValue(0);
        const rightX = xScale.getPixelForValue(2);
        
        ctx.save();
        
        // Draw class boxes with better styling
        classes.forEach((className, i) => {
            const y = classY[i];
            const boxHeight = 50;
            const boxWidth = 90;
            
            // Left side (Previous) - darker background
            ctx.fillStyle = 'rgba(70, 70, 70, 0.8)';
            ctx.fillRect(leftX - boxWidth/2, y - boxHeight/2, boxWidth, boxHeight);
            ctx.strokeStyle = '#e0e0e0';
            ctx.lineWidth = 2;
            ctx.strokeRect(leftX - boxWidth/2, y - boxHeight/2, boxWidth, boxHeight);
            
            // Right side (Current) - slightly lighter
            ctx.fillStyle = 'rgba(90, 90, 90, 0.8)';
            ctx.fillRect(rightX - boxWidth/2, y - boxHeight/2, boxWidth, boxHeight);
            ctx.strokeRect(rightX - boxWidth/2, y - boxHeight/2, boxWidth, boxHeight);
            
            // Class labels with better styling
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(className, leftX, y + 5);
            ctx.fillText(className, rightX, y + 5);
        });
        
        // Draw flow arrows with improved visibility
        if (this.flowData.transitions) {
            // Calculate max flow for thickness scaling
            const allFlows = Object.values(this.flowData.transitions)
                .flatMap(t => Object.values(t))
                .filter(count => count > 0);
            const maxFlow = Math.max(...allFlows, 1);
            
            Object.entries(this.flowData.transitions).forEach(([fromClass, transitions]) => {
                const fromIndex = classes.indexOf(fromClass);
                if (fromIndex === -1) return;
                
                Object.entries(transitions).forEach(([toClass, count]) => {
                    const toIndex = classes.indexOf(toClass);
                    if (toIndex === -1 || count <= 0) return;
                    
                    // Calculate flow thickness with better scaling
                    const thickness = Math.max(2, (count / maxFlow) * 15);
                    
                    // Draw curved arrow
                    this.drawFlowArrow(ctx, 
                        leftX + 45, classY[fromIndex],
                        rightX - 45, classY[toIndex],
                        thickness, count);
                });
            });
        }
        
        ctx.restore();
    }
    
    drawFlowArrow(ctx, startX, startY, endX, endY, thickness, count) {
        // Skip drawing if count is 0
        if (count <= 0) return;
        
        // Calculate control points for bezier curve
        const midX = (startX + endX) / 2;
        const distance = Math.abs(endY - startY);
        const controlOffset = Math.max(30, distance * 0.6); // Better curve control
        
        // Color based on direction with better visibility
        let color;
        if (endY < startY) {
            color = 'rgba(46, 204, 113, 0.8)'; // Brighter green for upward mobility
        } else if (endY > startY) {
            color = 'rgba(231, 76, 60, 0.8)'; // Brighter red for downward mobility
        } else {
            color = 'rgba(52, 152, 219, 0.8)'; // Brighter blue for staying in same class
        }
        
        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = Math.max(2, thickness);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        // Draw the curved line with better curve
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        
        if (Math.abs(endY - startY) < 10) {
            // For same-class transitions, draw a loop
            const loopHeight = 30;
            ctx.bezierCurveTo(
                startX + 20, startY - loopHeight,
                endX - 20, endY - loopHeight,
                endX, endY
            );
        } else {
            // For class changes, draw a smooth curve
            ctx.bezierCurveTo(
                startX + controlOffset, startY,
                endX - controlOffset, endY,
                endX, endY
            );
        }
        ctx.stroke();
        
        // Draw arrowhead with better proportions
        const arrowSize = Math.max(8, thickness * 0.8);
        const angle = Math.atan2(endY - startY, endX - startX);
        
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(
            endX - arrowSize * Math.cos(angle - Math.PI / 6),
            endY - arrowSize * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
            endX - arrowSize * Math.cos(angle + Math.PI / 6),
            endY - arrowSize * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fill();
        
        // Add count label with background for better readability
        const labelX = midX;
        const labelY = (startY + endY) / 2 - (Math.abs(endY - startY) < 10 ? 25 : 15);
        
        // Draw background for text
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        const textWidth = ctx.measureText(Math.round(count).toString()).width;
        ctx.fillRect(labelX - textWidth/2 - 4, labelY - 10, textWidth + 8, 16);
        
        // Draw text
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(Math.round(count).toString(), labelX, labelY);
        
        ctx.restore();
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
                        display: false,
                        text: title,
                        color: '#e0e0e0'
                    },
                    legend: {
                        display: false  // Hide legend since we're showing flow arrows
                    }
                },
                onHover: () => {}, // Disable hover
                animation: false, // Disable animation for immediate rendering
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Time Period',
                            color: '#e0e0e0'
                        },
                        min: 0,
                        max: 2,
                        ticks: { 
                            color: '#e0e0e0',
                            stepSize: 1,
                            callback: function(value) {
                                const labels = ['Previous', '', 'Current'];
                                return labels[value] || '';
                            }
                        },
                        grid: { color: 'rgba(224, 224, 224, 0.1)' }
                    },
                    y: {
                        title: {
                            display: false,  // Remove the Y-axis label
                            text: 'Economic Class',
                            color: '#e0e0e0'
                        },
                        min: -0.5,
                        max: 2.5,
                        ticks: { 
                            color: '#e0e0e0',
                            stepSize: 1,
                            callback: function(value) {
                                const labels = ['Lower', 'Middle', 'Upper'];
                                return labels[value] || '';
                            }
                        },
                        grid: { color: 'rgba(224, 224, 224, 0.1)' }
                    }
                }
            }
        });
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
            
            // Calculate transition flows from the mobility data
            const newFlowData = this.calculateClassTransitions(data);
            
            // Only update if flow data has changed significantly
            if (!this.flowData || this.hasFlowDataChanged(this.flowData, newFlowData)) {
                this.flowData = newFlowData;
                
                // Only update the chart if we don't have any datasets yet
                if (this.charts.mobility.data.datasets.length === 0) {
                    // Create a dummy dataset to trigger chart rendering only once
                    this.charts.mobility.data.datasets = [{
                        label: 'Class Transitions',
                        data: [], // Empty data, flows are drawn by custom rendering
                        showLine: false,
                        pointRadius: 0
                    }];
                    this.charts.mobility.update('none');
                }
                
                // Draw flows directly without chart update
                this.drawClassFlows(this.charts.mobility);
            }
            
        } catch (error) {
            console.error('Error updating mobility chart:', error);
        }
    }
    
    hasFlowDataChanged(oldData, newData) {
        if (!oldData || !newData) return true;
        
        // Compare transition matrices to see if there's significant change
        const threshold = 2; // Only redraw if changes are > 2 people
        
        for (const fromClass of ['Lower', 'Middle', 'Upper']) {
            for (const toClass of ['Lower', 'Middle', 'Upper']) {
                const oldCount = oldData.transitions?.[fromClass]?.[toClass] || 0;
                const newCount = newData.transitions?.[fromClass]?.[toClass] || 0;
                if (Math.abs(oldCount - newCount) > threshold) {
                    return true;
                }
            }
        }
        return false;
    }
    
    calculateClassTransitions(data) {
        // Count current class distribution
        const currentClassCounts = {
            'Lower': 0,
            'Middle': 0,
            'Upper': 0
        };
        
        if (Array.isArray(data)) {
            // Single policy mode
            data.forEach(agent => {
                const currentClass = agent.bracket || 'Middle';
                currentClassCounts[currentClass]++;
            });
        } else if (data && typeof data === 'object') {
            // Comparison mode - aggregate all policies
            Object.values(data).forEach(policyData => {
                if (Array.isArray(policyData)) {
                    policyData.forEach(agent => {
                        const currentClass = agent.bracket || 'Middle';
                        currentClassCounts[currentClass]++;
                    });
                }
            });
        }
        
        // Initialize transition matrix
        const transitions = {
            'Lower': { 'Lower': 0, 'Middle': 0, 'Upper': 0 },
            'Middle': { 'Lower': 0, 'Middle': 0, 'Upper': 0 },
            'Upper': { 'Lower': 0, 'Middle': 0, 'Upper': 0 }
        };
        
        // If we don't have previous data, assume everyone stayed in their current class
        if (!this.previousClassCounts) {
            Object.keys(currentClassCounts).forEach(className => {
                transitions[className][className] = currentClassCounts[className];
            });
            this.previousClassCounts = { ...currentClassCounts };
            return { transitions };
        }
        
        // Calculate net changes between classes
        const classChanges = {};
        Object.keys(currentClassCounts).forEach(className => {
            classChanges[className] = currentClassCounts[className] - this.previousClassCounts[className];
        });
        
        // Distribute transitions based on net changes
        // Start with everyone staying in their previous class
        Object.keys(this.previousClassCounts).forEach(className => {
            transitions[className][className] = this.previousClassCounts[className];
        });
        
        // Now calculate the actual movements based on net changes
        // Priority: Lower->Middle->Upper for upward mobility, Upper->Middle->Lower for downward
        const classes = ['Lower', 'Middle', 'Upper'];
        
        // Process upward mobility (Lower class losses go to Middle/Upper gains)
        if (classChanges['Lower'] < 0 && (classChanges['Middle'] > 0 || classChanges['Upper'] > 0)) {
            let lowerLosses = Math.abs(classChanges['Lower']);
            
            // Distribute losses from Lower to Middle and Upper gains
            if (classChanges['Middle'] > 0) {
                const toMiddle = Math.min(lowerLosses, classChanges['Middle']);
                transitions['Lower']['Middle'] += toMiddle;
                transitions['Lower']['Lower'] -= toMiddle;
                lowerLosses -= toMiddle;
            }
            
            if (lowerLosses > 0 && classChanges['Upper'] > 0) {
                const toUpper = Math.min(lowerLosses, classChanges['Upper']);
                transitions['Lower']['Upper'] += toUpper;
                transitions['Lower']['Lower'] -= toUpper;
                lowerLosses -= toUpper;
            }
        }
        
        // Process Middle class movements
        if (classChanges['Middle'] < 0) {
            let middleLosses = Math.abs(classChanges['Middle']);
            
            // Middle losses can go to Lower or Upper
            if (classChanges['Lower'] > 0) {
                const toLower = Math.min(middleLosses, classChanges['Lower']);
                transitions['Middle']['Lower'] += toLower;
                transitions['Middle']['Middle'] -= toLower;
                middleLosses -= toLower;
            }
            
            if (middleLosses > 0 && classChanges['Upper'] > 0) {
                const toUpper = Math.min(middleLosses, classChanges['Upper']);
                transitions['Middle']['Upper'] += toUpper;
                transitions['Middle']['Middle'] -= toUpper;
                middleLosses -= toUpper;
            }
        } else if (classChanges['Middle'] > 0) {
            // Middle gains (some already handled from Lower losses above)
            let remainingMiddleGains = classChanges['Middle'];
            
            // Check if Lower already contributed
            const lowerToMiddle = transitions['Lower']['Middle'] - 0; // Subtract baseline (0)
            remainingMiddleGains -= lowerToMiddle;
            
            // Remaining gains come from Upper losses
            if (remainingMiddleGains > 0 && classChanges['Upper'] < 0) {
                const fromUpper = Math.min(remainingMiddleGains, Math.abs(classChanges['Upper']));
                transitions['Upper']['Middle'] += fromUpper;
                transitions['Upper']['Upper'] -= fromUpper;
            }
        }
        
        // Process downward mobility from Upper
        if (classChanges['Upper'] < 0) {
            let upperLosses = Math.abs(classChanges['Upper']);
            
            // Some Upper losses may have already been handled above
            const upperToMiddle = transitions['Upper']['Middle'] - 0; // Subtract baseline (0)
            upperLosses -= upperToMiddle;
            
            // Remaining losses go to Lower
            if (upperLosses > 0 && classChanges['Lower'] > 0) {
                // Check remaining Lower gains not yet accounted for
                const lowerToMiddle = transitions['Lower']['Middle'] - 0;
                const middleToLower = transitions['Middle']['Lower'] - 0;
                let remainingLowerGains = classChanges['Lower'] - middleToLower;
                
                if (remainingLowerGains > 0) {
                    const toLower = Math.min(upperLosses, remainingLowerGains);
                    transitions['Upper']['Lower'] += toLower;
                    transitions['Upper']['Upper'] -= toLower;
                }
            }
        }
        
        // Ensure no negative values and round to whole people
        Object.keys(transitions).forEach(fromClass => {
            Object.keys(transitions[fromClass]).forEach(toClass => {
                transitions[fromClass][toClass] = Math.max(0, Math.round(transitions[fromClass][toClass]));
            });
        });
        
        // Store current counts for next iteration
        this.previousClassCounts = { ...currentClassCounts };
        
        return { transitions };
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
            if (this.currentView === 'person') {
                await this.updatePersonView();
            } else {
                if (incremental) {
                    await Promise.all([
                        this.updateWealthChart(),
                        this.updateMobilityChart(),
                        this.updateGiniChart(true),
                        this.updateTotalWealthChart(true)
                    ]);
                } else {
                    await Promise.all([
                        this.updateWealthChart(),
                        this.updateMobilityChart(),
                        this.updateGiniChart(false),
                        this.updateTotalWealthChart(false)
                    ]);
                }
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

    async updatePersonView() {
        try {
            const status = await this.apiCall('/status');
            if (!status.initialized) return;
            // Fetch wealth distribution to compute richest/poorest and select 'you'
            const wealthData = await this.apiCall('/data/wealth-distribution');
            let wealths = [];
            let policies = [];
            let isComparison = !wealthData.current && wealthData && typeof wealthData === 'object';
            if (wealthData.current && Array.isArray(wealthData.current)) {
                wealths = wealthData.current;
                // For single policy mode, policy is uniform
                policies = Array(wealths.length).fill(status.policy || '—');
            } else if (isComparison) {
                // Build arrays aligned per agent: wealths[] and policies[]
                const order = ['econophysics', 'powerful leaders', 'equal wealth distribution', 'innovation'];
                order.forEach(policy => {
                    const arr = wealthData[policy] || [];
                    arr.forEach(v => {
                        wealths.push(v);
                        policies.push(policy);
                    });
                });
                // If mobility endpoint returns richer objects per agent, prefer that mapping
                try {
                    const mob = await this.apiCall('/data/mobility');
                    // mob is object {policy: [ {wealth, policy,...} ]}
                    const wealths2 = [];
                    const policies2 = [];
                    order.forEach(policy => {
                        const list = mob[policy] || [];
                        list.forEach(a => {
                            if (typeof a.wealth === 'number') {
                                wealths2.push(a.wealth);
                                policies2.push(a.policy || policy);
                            }
                        });
                    });
                    if (wealths2.length) { wealths = wealths2; policies = policies2; }
                } catch(_) { /* fallback already set */ }
            }
            if (!wealths.length) return;

            // Determine richest and poorest
            // Stable tie-breaking: if multiple with same wealth, keep previous index if still matches
            let richest = Math.max(...wealths);
            let poorest = Math.min(...wealths);
            let candidateRichestIdx = wealths.indexOf(richest);
            let candidatePoorestIdx = wealths.indexOf(poorest);
            let richestIdx = candidateRichestIdx;
            let poorestIdx = candidatePoorestIdx;
            if (this.cachedRichestWealth === richest && this.cachedRichestIdx != null && wealths[this.cachedRichestIdx] === richest) {
                richestIdx = this.cachedRichestIdx;
            }
            if (this.cachedPoorestWealth === poorest && this.cachedPoorestIdx != null && wealths[this.cachedPoorestIdx] === poorest) {
                poorestIdx = this.cachedPoorestIdx;
            }

            // pick 'you' index within bounds
            if (this.youIndex == null || this.youIndex >= wealths.length) {
                this.youIndex = Math.floor(Math.random() * wealths.length);
            }
            const youWealth = wealths[this.youIndex];

            // Update DOM
            const fmt = (n) => {
                if (typeof n !== 'number' || !isFinite(n)) return '—';
                const parts = (val) => {
                    if (Math.abs(val) >= 1e9) return (val/1e9).toFixed(1) + ' B';
                    if (Math.abs(val) >= 1e6) return (val/1e6).toFixed(1) + ' M';
                    if (Math.abs(val) >= 1e3) return (val/1e3).toFixed(1) + ' K';
                    return val.toFixed(0);
                };
                return `$ ${parts(n)}`;
            };
            const policy = status.policy || '—';
            const richestEl = document.getElementById('richest-wealth');
            const poorestEl = document.getElementById('poorest-wealth');
            const youEl = document.getElementById('you-wealth');
            const youPolicyEl = document.getElementById('you-policy');
            const richestPolicyEl = document.getElementById('richest-policy');
            const poorestPolicyEl = document.getElementById('poorest-policy');
            if (richestEl) richestEl.textContent = fmt(richest);
            if (poorestEl) poorestEl.textContent = fmt(poorest);
            if (youEl) youEl.textContent = fmt(youWealth);
            // Policies per person
            if (Array.isArray(policies) && policies.length === wealths.length) {
                if (youPolicyEl) youPolicyEl.textContent = policies[this.youIndex] || policy;
                if (richestPolicyEl) richestPolicyEl.textContent = policies[richestIdx] || policy;
                if (poorestPolicyEl) poorestPolicyEl.textContent = policies[poorestIdx] || policy;
            } else {
                if (youPolicyEl) youPolicyEl.textContent = policy;
                if (richestPolicyEl) richestPolicyEl.textContent = policy;
                if (poorestPolicyEl) poorestPolicyEl.textContent = policy;
            }

            // Render avatars with mood based on absolute wealth relative to distribution
            const renderAvatar = (elId, wealth, seed, mood) => {
                const el = document.getElementById(elId);
                if (!el) return;
                
                // Clear previous avatar
                el.innerHTML = '';
                
                // Use the successor to the 'avataaars' style
                const style = 'personas';
                const encodedSeed = encodeURIComponent(seed || 'seed');

                // Determine mouth parameter based on mood
                let mouthParam = 'smirk';
                if (mood === 'happy') mouthParam = 'smile';
                else if (mood === 'sad') mouthParam = 'frown';
                
                // Eyes parameter remains 'default'
                const eyesParam = 'open';

                // Construct the updated URL for DiceBear API v8.x
                const url = `https://api.dicebear.com/9.x/${style}/svg?seed=${encodedSeed}&mouth=${mouthParam}&eyes=${eyesParam}&facialHairProbability=10`;
                console.log('Avatar URL:', url);
                const img = document.createElement('img');
                img.alt = 'avatar';
                img.loading = 'lazy';
                img.src = url;
                el.appendChild(img);
            };
            
            // compute mood by brackets, mirroring utilities.py
            const sortedWealth = [...wealths].sort((a, b) => a - b)
            const lowerBracket = sortedWealth[Math.floor(sortedWealth.length * 0.33)] || 0;
            const upperBracket = sortedWealth[Math.floor(sortedWealth.length * 0.67)] || 0;
            
            const moodOf = (w) => {
                if (w >= upperBracket) return 'happy';
                if (w < lowerBracket) return 'sad';
                return 'neutral';
            };


            // update 'you' avatar with stable seed always
            const urlParams = new URLSearchParams(window.location.search);
            const seed = urlParams.get('seed') || localStorage.getItem('avatar_seed') || 'default-seed';
            
            // Save to localStorage so it persists on reloads of landing.html
            localStorage.setItem('avatar_seed', seed);

            renderAvatar('you-avatar', youWealth, seed, moodOf(youWealth));

            // only update richest/poorest avatars if identity changed
            const richestChanged = this.cachedRichestIdx !== richestIdx;
            const poorestChanged = this.cachedPoorestIdx !== poorestIdx;
            if (richestChanged) {
                this.cachedRichestIdx = richestIdx;
                this.cachedRichestWealth = richest;
                const rSeed = `richest-${richestIdx}`;
                renderAvatar('richest-avatar', richest, rSeed, moodOf(richest));
            }
            if (poorestChanged) {
                this.cachedPoorestIdx = poorestIdx;
                this.cachedPoorestWealth = poorest;
                const pSeed = `poorest-${poorestIdx}`;
                renderAvatar('poorest-avatar', poorest, pSeed, moodOf(poorest));
            }
        } catch (e) {
            console.warn('Person view update failed', e);
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
    
    showInfoModal(policy, async () => {
        const initBtn = document.getElementById('initialize-btn');
        initBtn.disabled = true;
        initBtn.textContent = 'Initializing...';
    
        try {
            await simulator.apiCall('/initialize', 'POST', {
                policy: policy,
                population: population
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
    });
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