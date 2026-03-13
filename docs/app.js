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
            this.apiBase = 'https://inequality-simulator.onrender.com/api';
        } else if (isOnRender) {
            // When deployed on Render, use relative paths (same domain)
            this.apiBase = '/api';
        } else if (isLocalhost) {
            // Local development
            this.apiBase = 'http://localhost:5000/api';
        } else {
            // Local network access (e.g. mobile testing)
            const apiProtocol = protocol === 'https:' ? 'https:' : 'http:';
            this.apiBase = `${apiProtocol}//192.168.50.4:5000/api`;
        }

        this.testBackendConnection();
        
        this.charts = {};
        this.isInitialized = false;
        this.isRunning = false;
        this.isContinuousRunning = false;
        this.continuousRunInterval = null;
        this.stepCount = 0; // Track current step for incremental updates
        this.agentPositions = {}; // Store fixed x positions for agents
        this.previousClassCounts = null; // Store previous class distribution for flow calculation
    this.currentView = 'population';
    this.youIndex = null; // which agent index represents "you"
    this.selectedCharacterIdx = null;
    this._charPickerResolver = null;
    this._sceneReadyPromise = null;
    this._resolveSceneReady = null;
    const urlParams = new URLSearchParams(window.location.search);
    this.youSeed = urlParams.get('seed') || localStorage.getItem('sim_you_seed') || (Math.random().toString(36).slice(2));
    localStorage.setItem('sim_you_seed', this.youSeed);

    // 3D SceneManager — created lazily the first time person view is opened
    this.sceneManager     = null;
    this.sceneCameraMode  = 'third';  // 'third' | 'first'

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

        this._updateCameraModeLabel();

    }

    /**
     * setView(view)
     * Toggle between 'person' (3D scene) and 'population' (charts).
     * On the first switch to person view the SceneManager is created
     * and GLB assets are loaded from /assets/.
     */
    setView(view) {
        this.currentView = view;
        const personView    = document.getElementById('person-view');
        const chartCarousel = document.getElementById('chart-carousel');

        if (view === 'person') {
            if (chartCarousel) chartCarousel.style.display = 'none';
            if (personView)    personView.style.display    = 'block';

            // Initialise Three.js scene the very first time
            if (!this.sceneManager) this._initScene();

            // If a model is already running, push data to scene immediately
            if (this.isInitialized) this.updatePersonView();

        } else {
            if (personView)    personView.style.display    = 'none';
            if (chartCarousel) chartCarousel.style.display = 'block';
        }
    }

    /**
     * _initScene()
     * Creates the SceneManager, initialises the Three.js renderer on the
     * #scene canvas, and begins loading the four Mixamo GLB files.
     * Called once, lazily, on the first switch to person view.
     */
    _initScene() {
        const canvas = document.getElementById('scene');
        if (!canvas || typeof SceneManager === 'undefined') {
            console.warn('[app.js] SceneManager or #scene canvas not found.');
            return;
        }

        this._sceneReadyPromise = new Promise((resolve) => {
            this._resolveSceneReady = resolve;
        });

        this.sceneManager = new SceneManager(canvas);
        this.sceneManager.init();

        // One frame after init, force the renderer to match the actual canvas
        // dimensions — guards against the edge case where the browser hadn't
        // finished painting when init() read clientWidth/clientHeight.
        requestAnimationFrame(() => {
            if (this.sceneManager) this.sceneManager._onResize();
        });

        this.sceneManager.loadCharacter(() => {
            // All GLBs ready — populate the character picker first so the grid
            // is fully built before the spinner disappears (prevents a blank-
            // picker flash). Then fade out the loading spinner.
            this._showCharPicker();
            const loadingEl = document.getElementById('scene-loading');
            if (loadingEl) {
                gsap.to(loadingEl, {
                    opacity: 0, duration: 0.4,
                    onComplete: () => {
                        loadingEl.style.display = 'none';
                    }
                });
            }
            this._resolveSceneReady?.();
            this._resolveSceneReady = null;
            console.log('[app.js] Scene ready.');
            if (this.isInitialized) this.updatePersonView();
        });
    }

    /**
     * awaitSceneReady()
     * Ensures the 3D scene and character assets are fully loaded.
     *
     * @returns {Promise<void>}
     */
    async awaitSceneReady() {
        if (!this.sceneManager) {
            this._initScene();
        }

        if (this.sceneManager?.isLoaded) {
            return;
        }

        if (this._sceneReadyPromise) {
            await this._sceneReadyPromise;
        }
    }

    /**
     * _showCharPicker()
     * Populates and fades in the character selection overlay.
     * If there is only one character the picker is skipped automatically.
     */
    _showCharPicker(options = {}) {
        // If only one character is loaded, skip the picker
        if (!this.sceneManager || this.sceneManager.characterPool.length <= 1) {
            // Still apply index 0 so mixer is bound correctly
            this.selectedCharacterIdx = 0;
            this.sceneManager && this.sceneManager.setPlayerCharacter(0);
            return;
        }

        const picker = document.getElementById('char-picker');
        if (!picker) return;
        const { title, subtitle } = options;

        const titleEl = picker.querySelector('#char-picker-title');
        const subEl = picker.querySelector('#char-picker-sub');
        if (titleEl && title) titleEl.textContent = title;
        if (subEl && subtitle) subEl.textContent = subtitle;

        // Build one card per character dynamically from CHAR_META
        const grid = picker.querySelector('#char-picker-grid');
        grid.innerHTML = '';
        const pool = typeof CHAR_META !== 'undefined' ? CHAR_META : [];
        const count = this.sceneManager.characterPool.length;
        for (let i = 0; i < count; i++) {
            const meta = pool[i] || { name: `Character ${i + 1}`, emoji: '🧑' };
            const card = document.createElement('button');
            card.className = 'char-card';
            const portraitSrc = this.sceneManager.getCharacterPortraitDataUrl?.(i, 160);
            card.innerHTML = `${portraitSrc
                ? `<img class="char-portrait" src="${portraitSrc}" alt="${meta.name}" />`
                : `<span class="char-name">${meta.emoji}</span>`}
                              <span class="char-name">${meta.name}</span>`;
            card.addEventListener('click', () => this.selectCharacter(i));
            grid.appendChild(card);
        }

        picker.style.display = 'flex';
        gsap.fromTo(picker, { opacity: 0 }, { opacity: 1, duration: 0.4 });
    }

    /**
     * selectCharacter(idx)
     * Called when a card in the character picker is clicked.
     */
    selectCharacter(idx) {
        this.selectedCharacterIdx = idx;
        if (this.sceneManager) this.sceneManager.setPlayerCharacter(idx);

        const picker = document.getElementById('char-picker');
        if (picker) {
            gsap.to(picker, {
                opacity: 0, duration: 0.3,
                onComplete: () => {
                    picker.style.display = 'none';
                    const resolver = this._charPickerResolver;
                    this._charPickerResolver = null;
                    resolver?.(idx);
                }
            });
        } else {
            const resolver = this._charPickerResolver;
            this._charPickerResolver = null;
            resolver?.(idx);
        }
    }

    /**
     * promptCharacterSelection()
     * Shows the picker as part of initialization and resolves with the chosen index.
     *
     * @returns {Promise<number>}
     */
    promptCharacterSelection() {
        if (!this.sceneManager || !this.sceneManager.isLoaded) {
            return Promise.resolve(this.selectedCharacterIdx ?? 0);
        }

        return new Promise((resolve) => {
            this._charPickerResolver = resolve;
            this._showCharPicker({
                title: 'Choose your character',
                subtitle: 'Pick who you want to follow before initializing the simulator',
            });
        });
    }

    /**
     * toggleCameraMode()
     * Called by the camera toggle button in landing.html.
     * Flips between third-person (behind character) and first-person
     * (eye level, crowd visible).
     */
    toggleCameraMode() {
        this.sceneCameraMode = (this.sceneCameraMode === 'third') ? 'first' : 'third';
        if (this.sceneManager) {
            this.sceneManager.setCameraMode(this.sceneCameraMode);
        }
        // Shrink wealth display slightly in first-person mode
        const overlay = document.getElementById('scene-overlay');
        if (overlay) {
            overlay.classList.toggle('fp-hud', this.sceneCameraMode === 'first');
        }
        this._updateCameraModeLabel();
    }

    /**
     * _updateCameraModeLabel()
     * Reflects the currently active camera mode in the bottom-right button.
     */
    _updateCameraModeLabel() {
        const label = document.getElementById('cam-mode-label');
        if (label) {
            label.innerHTML = this.sceneCameraMode === 'third'
                ? '&#128694; Third Person'
                : '&#128065; First Person';
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
            // Clear any in-flight money particles so they don't keep
            // animating after the simulation has stopped.
            if (this.sceneManager) this.sceneManager.clearParticles();
        }
    }
    
    resetCharts() {
        // Clear all chart data
        this.stepCount = 0;
        this.agentPositions = {}; // Reset agent positions
        this.previousClassCounts = null; // Reset previous class counts for flow calculation
    this.youIndex = null; // reset chosen person on re-init
    // youSeed stays stable so the same virtual person is tracked across re-inits
        
        // Reset line charts (Gini and Total Wealth)
        this.charts.gini.data.labels = [];
        this.charts.gini.data.datasets = [{
            label: 'Inequality Metric',
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
                headers: { 'Content-Type': 'application/json' },
                mode: 'cors',
            };

            if (data) options.body = JSON.stringify(data);

            const response = await fetch(`${this.apiBase}${endpoint}`, options);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
            }

            return await response.json();
        } catch (error) {
            console.error(`API call failed [${method} ${endpoint}]:`, error.message);
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
        // Initialize charts only if their canvas elements exist in the DOM
        if (document.getElementById('wealth-chart'))
            this.charts.wealth = this.createHistogramChart('wealth-chart');
        if (document.getElementById('mobility-chart'))
            this.charts.mobility = this.createScatterChart('mobility-chart');
        if (document.getElementById('gini-chart'))
            this.charts.gini = this.createLineChart('gini-chart');
        if (document.getElementById('total-wealth-chart'))
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
            
            // Update sidebar stat card
            const giniStatEl = document.getElementById('stat-gini');
            if (giniStatEl) {
                const ds = this.charts.gini.data.datasets[0];
                if (ds?.data?.length) {
                    const v = ds.data[ds.data.length - 1];
                    giniStatEl.textContent = (typeof v === 'number' && isFinite(v)) ? v.toFixed(3) : '—';
                }
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
            
            // Update sidebar stat card
            const twStatEl = document.getElementById('stat-total-wealth');
            if (twStatEl) {
                const ds = this.charts.totalWealth.data.datasets[0];
                if (ds?.data?.length) {
                    const v = ds.data[ds.data.length - 1];
                    if (typeof v === 'number' && isFinite(v)) {
                        const a = Math.abs(v);
                        twStatEl.textContent =
                            a >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` :
                            a >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` :
                            a >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` :
                            `$${Math.round(v)}`;
                    } else {
                        twStatEl.textContent = '—';
                    }
                }
            }

            this.charts.totalWealth.update('none'); // 'none' mode for faster updates
        } catch (error) {
            console.error('Error updating total wealth chart:', error);
        }
    }

    async _updateStatCards() {
        try {
            const [giniData, wealthData] = await Promise.all([
                this.apiCall('/data/gini'),
                this.apiCall('/data/total-wealth'),
            ]);

            const giniEl = document.getElementById('stat-gini');
            if (giniEl) {
                let gini = null;
                if (Array.isArray(giniData.current) && giniData.current.length) {
                    gini = giniData.current[giniData.current.length - 1];
                } else {
                    const vals = Object.values(giniData).filter(Array.isArray);
                    if (vals.length) {
                        const lasts = vals.map(a => a[a.length - 1]).filter(v => isFinite(v));
                        if (lasts.length) gini = lasts.reduce((a, b) => a + b, 0) / lasts.length;
                    }
                }
                giniEl.textContent = (typeof gini === 'number' && isFinite(gini)) ? gini.toFixed(3) : '\u2014';
            }

            const twEl = document.getElementById('stat-total-wealth');
            if (twEl) {
                let total = null;
                if (Array.isArray(wealthData.current) && wealthData.current.length) {
                    total = wealthData.current[wealthData.current.length - 1];
                } else {
                    const vals = Object.values(wealthData).filter(Array.isArray);
                    if (vals.length) {
                        const lasts = vals.map(a => a[a.length - 1]).filter(v => isFinite(v));
                        if (lasts.length) total = lasts.reduce((a, b) => a + b, 0) / lasts.length;
                    }
                }
                if (typeof total === 'number' && isFinite(total)) {
                    const a = Math.abs(total);
                    twEl.textContent =
                        a >= 1e9 ? `$${(total / 1e9).toFixed(1)}B` :
                        a >= 1e6 ? `$${(total / 1e6).toFixed(1)}M` :
                        a >= 1e3 ? `$${(total / 1e3).toFixed(1)}K` :
                        `$${Math.round(total)}`;
                } else {
                    twEl.textContent = '\u2014';
                }
            }
        } catch (_) { /* stat cards are non-critical */ }
    }

    async refreshCharts(incremental = false) {
        if (!this.isInitialized) return;

        try {
            // Stat cards always update regardless of which view is active
            const tasks = [this._updateStatCards()];

            if (this.currentView === 'person') {
                tasks.push(this.updatePersonView());
            } else {
                tasks.push(
                    this.updateWealthChart(),
                    this.updateMobilityChart(),
                    this.updateGiniChart(incremental),
                    this.updateTotalWealthChart(incremental),
                );
            }

            await Promise.all(tasks);
        } catch (_) { /* individual methods handle their own errors */ }
    }

    /**
     * updatePersonView()
     * ------------------------------------------------------------------
     * Called every simulation step when the person view is active.
     *
     * Fetches wealth + mobility data, finds "you" in the population,
     * then:
     *   1. Updates the HUD overlays (#you-bracket-badge, etc.)
     *   2. Drives the 3D character via sceneManager.update()
     */
    async updatePersonView() {
        try {
            const status = await this.apiCall('/status');
            if (!status.initialized) return;

            // Fetch both endpoints in parallel for speed
            const [wealthData, mobData, exchangeData] = await Promise.all([
                this.apiCall('/data/wealth-distribution'),
                this.apiCall('/data/mobility'),
                this.apiCall('/data/exchanges').catch(() => ({ edges: [] })),
            ]);

            // ── Flatten agent arrays ──────────────────────────────
            let wealths  = [];  // number[]  — one entry per agent
            let brackets = [];  // string[]  — 'Lower' | 'Middle' | 'Upper'

            const isComparison = !wealthData.current;

            if (!isComparison && Array.isArray(wealthData.current)) {
                wealths  = wealthData.current;
                const mobArr = Array.isArray(mobData)
                    ? mobData
                    : (Array.isArray(mobData?.current) ? mobData.current : []);
                brackets = mobArr.map(a => a.bracket || 'Middle');
                // Pad if lengths differ
                while (brackets.length < wealths.length) brackets.push('Middle');

            } else if (isComparison) {
                const order = ['econophysics', 'fascism', 'communism', 'capitalism'];
                order.forEach(policy => {
                    (wealthData[policy] || []).forEach(v  => wealths.push(v));
                    (mobData[policy]    || []).forEach(a  => brackets.push(a.bracket || 'Middle'));
                });
            }

            if (!wealths.length) return;

            // ── Pick "you" index (stable across steps) ────────────
            if (this.youIndex == null || this.youIndex >= wealths.length) {
                this.youIndex = Math.floor(Math.random() * wealths.length);
            }

            const youWealth  = wealths[this.youIndex];
            const youBracket = brackets[this.youIndex] || 'Middle';

            // ── Percentile: what % of agents earn less than you ───
            const below      = wealths.filter(w => w < youWealth).length;
            const percentile = Math.round((below / wealths.length) * 100);
            const pctLabel   = percentile >= 50
                ? `Top ${100 - percentile}%`
                : `Bottom ${percentile + 1}%`;

            // ── Update HUD overlays ───────────────────────────────
            const fmt = (n) => {
                if (typeof n !== 'number' || !isFinite(n)) return '—';
                if (Math.abs(n) >= 1e9) return `$ ${(n/1e9).toFixed(1)} B`;
                if (Math.abs(n) >= 1e6) return `$ ${(n/1e6).toFixed(1)} M`;
                if (Math.abs(n) >= 1e3) return `$ ${(n/1e3).toFixed(1)} K`;
                return `$ ${n.toFixed(0)}`;
            };

            const badgeEl  = document.getElementById('you-bracket-badge');
            const wealthEl = document.getElementById('you-wealth-display');
            const pctEl    = document.getElementById('you-percentile');

            if (badgeEl) {
                badgeEl.textContent = youBracket;
                // Replace any existing bracket class with the current one
                badgeEl.classList.remove('Lower', 'Middle', 'Upper');
                badgeEl.classList.add(youBracket);
            }

            // Animate wealth counter with GSAP instead of a hard set
            if (wealthEl) {
                const from = parseFloat(wealthEl.dataset.raw || '0');
                const obj  = { val: from };
                gsap.to(obj, {
                    val: youWealth, duration: 0.6, ease: 'power1.out',
                    onUpdate: () => { wealthEl.textContent = fmt(obj.val); }
                });
                wealthEl.dataset.raw = youWealth;
            }
            if (pctEl) pctEl.textContent = pctLabel;

            // ── Drive 3D character ────────────────────────────────
            if (this.sceneManager && this.sceneManager.isLoaded) {
                // Pass up to 99 crowd brackets (exclude "you")
                const crowdAgentIndices = wealths
                    .map((_, i) => i)
                    .filter((i) => i !== this.youIndex)
                    .slice(0, 99);

                const crowdBrackets = crowdAgentIndices.map(i => brackets[i] || 'Middle');

                // Per-crowd member wealth and percentile label for overlay labels
                const crowdWealth = crowdAgentIndices.map(i => wealths[i] ?? 0);
                const crowdPctLabel = crowdAgentIndices.map(i => {
                    const w = wealths[i] ?? 0;
                    const below = wealths.filter(x => x < w).length;
                    const p = Math.round((below / wealths.length) * 100);
                    return p >= 50 ? `Top ${100 - p}%` : `Bottom ${p + 1}%`;
                });

                this.sceneManager.update({
                    bracket:           youBracket,
                    wealth:            youWealth,
                    percentile,
                    youPctLabel:       pctLabel,
                    crowdBrackets,
                    crowdAgentIndices,
                    crowdWealth,
                    crowdPctLabel,
                    exchanges:         exchangeData?.edges ?? [],
                    youAgentIdx:       this.youIndex,
                });
            }

        } catch (e) {
            console.warn('[updatePersonView] failed:', e);
        }
    }
}

// Global instance

let simulator;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    simulator = new InequalitySimulator();
    window.simulator = simulator;  
});

// Global functions for button clicks
async function initializeModel() {
    const policy = document.getElementById('policy-select').value;
    const population = parseInt(document.getElementById('population-input').value);
    const patron = document.getElementById('patron-toggle').checked; // Get patron toggle state

    showInfoModal(policy, async () => {
        const initBtn = document.getElementById('initialize-btn');
        initBtn.disabled = true;
        initBtn.textContent = 'Initializing...';

        try {
            await simulator.apiCall('/initialize', 'POST', {
                policy: policy,
                population: population,
                patron: patron // Pass patron state to the backend
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