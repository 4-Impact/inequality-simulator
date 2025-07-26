# Inequality Simulator - Custom Frontend

This project has been converted from a Solara-based frontend to a custom HTML/JavaScript frontend with a Flask backend API.

## Architecture

- **Backend**: Flask REST API (`app.py`) that serves the model data
- **Frontend**: Vanilla HTML/CSS/JavaScript (no React) in the `static/` folder
- **Model**: Original Mesa-based inequality simulation model

## Setup and Installation

1. Install the required Python packages:
```bash
pip install -r requirements.txt
```

2. Run the application:
```bash
python run.py
```

This will:
- Start the Flask backend on http://localhost:5000
- Automatically open your browser to the frontend interface
- Provide API endpoints for the frontend to consume

## Usage

### Web Interface

The web interface provides:
- **Policy Selection**: Choose from different economic policies
- **Population Settings**: Adjust the number of agents
- **Startup Requirements**: Set different capital requirements for innovation
- **Real-time Visualization**: Charts showing:
  - Wealth distribution histogram
  - Economic mobility scatter plot
  - Gini coefficient over time
  - Total wealth over time

### Controls

- **Initialize Model**: Create a new model with selected parameters
- **Step**: Run one simulation step
- **Run 50 Steps**: Execute 50 simulation steps at once
- **Refresh Charts**: Update all visualizations with current data

### Policies Available

1. **Econophysics**: Basic wealth exchange model
2. **Powerful Leaders**: Party elites collect taxes from subordinates
3. **Equal Wealth Distribution**: Wealth is redistributed equally each step
4. **Innovation**: Agents can invest in innovation to increase income
5. **Comparison**: Run all policies simultaneously and compare results

## API Endpoints

The Flask backend provides the following REST API endpoints:

- `GET /` - Serve the main HTML interface
- `POST /api/initialize` - Initialize a new model
- `POST /api/step` - Run one simulation step
- `POST /api/run` - Run multiple simulation steps
- `GET /api/data/wealth-distribution` - Get wealth distribution data
- `GET /api/data/mobility` - Get mobility data for visualization
- `GET /api/data/gini` - Get Gini coefficient data over time
- `GET /api/data/total-wealth` - Get total wealth data over time
- `GET /api/status` - Get current model status

## File Structure

```
py_cafe/
├── app.py                  # Flask REST API server
├── run.py                  # Main application runner
├── model.py                # Original Mesa model (Solara components removed)
├── utilities.py            # Helper functions
├── requirements.txt        # Python dependencies
├── docs/
│   ├── index.html         # Landing page
│   ├── landing.html       # Main web interface
│   └── app.js             # Frontend JavaScript logic
└── __pycache__/           # Python cache files
```

## Key Changes from Solara Version

1. **Removed Solara Dependencies**: No longer requires Solara or Jupyter
2. **Added Flask Backend**: REST API for model operations
3. **Custom Frontend**: Pure HTML/CSS/JavaScript interface
4. **Chart.js Visualizations**: Interactive charts without Matplotlib backend
5. **Asynchronous Updates**: Non-blocking chart updates and model execution

## Features

- **No React Dependency**: Uses vanilla JavaScript for all frontend logic
- **Responsive Design**: Works on desktop and mobile devices
- **Real-time Updates**: Charts update dynamically as the model runs
- **Error Handling**: Graceful error messages and recovery
- **Comparison Mode**: Run multiple policies simultaneously
- **Thread-safe**: Backend handles concurrent requests safely

## Troubleshooting

- **Port 5000 in use**: Change the port in `app.py` and `run.py`
- **Charts not updating**: Check browser console for JavaScript errors
- **Model not initializing**: Ensure all dependencies are installed correctly
- **CORS errors**: The Flask-CORS extension should handle cross-origin requests

## Development

To modify the frontend:
- Edit `docs/index.html` for landing page changes
- Edit `docs/landing.html` for main interface layout changes
- Edit `docs/app.js` for functionality changes
- Edit `app.py` for API modifications


The system is designed to be easily extensible with additional visualization types and model parameters.
