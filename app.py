# -*- coding: utf-8 -*-
"""
Inequality Simulator - Updated for Custom Frontend

This file is now deprecated. The Solara frontend has been replaced with a 
custom HTML/JavaScript frontend and Flask backend.

To run the new system, use:
    python run.py

Or manually start the backend:
    python backend.py

Then open your browser to http://localhost:5000
"""

print("=" * 60)
print("NOTICE: This app has been converted to a custom frontend")
print("=" * 60)
print("The Solara-based interface has been replaced with:")
print("- Flask REST API backend")
print("- Custom HTML/CSS/JavaScript frontend (no React)")
print("")
print("To run the new system:")
print("1. Install requirements: pip install -r requirements.txt")
print("2. Run the application: python run.py")
print("3. Open browser to: http://localhost:5000")
print("=" * 60)

# Legacy Solara code (commented out)
"""
from model import WealthModel
from model import Histogram, Mobility, GiniPlot, TotalWealthPlot
from mesa.visualization import SolaraViz,make_plot_component

model = WealthModel()
model_params = {
    "policy": {
        "type": "Select",
        "value": "innovation",
        "values": ["econophysics", "powerful leaders","equal wealth distribution", "innovation", "comparison"],
        "text": "Select Policy"
    }
}

Page = SolaraViz(
    model, 
    components=[Mobility, GiniPlot, TotalWealthPlot, Histogram],
    model_params=model_params,
)
"""