#!/usr/bin/env python3
"""
Run script for the Inequality Simulator backend
This replaces the Solara frontend with a Flask backend + vanilla JS frontend
"""

import os
import sys
import webbrowser
import time
import threading

def run_server():
    """Run the Flask backend server"""
    # Import the app and the reset function
    from app import app, reset_logic_internal
    
    # FIX: Force a logic reset every time the server starts
    print("Resetting simulation logic to default...")
    reset_logic_internal()
    
    print("Starting Inequality Simulator Backend...")
    print("Backend API will be available at: http://localhost:5000/api")
    print("Frontend will be available at: http://localhost:5000")
    print("\nPress Ctrl+C to stop the server")
    
    # Disable reloader to prevent double-execution/restarts
    app.run(debug=True, use_reloader=False, host='0.0.0.0', port=5000)

def open_browser():
    """Open browser after a short delay"""
    time.sleep(2)
    webbrowser.open('http://localhost:5000')

if __name__ == "__main__":
    print("=" * 60)
    print("Inequality Simulator - Custom Frontend")
    print("=" * 60)
    
    # Start browser opening in a separate thread
    browser_thread = threading.Thread(target=open_browser)
    browser_thread.daemon = True
    browser_thread.start()
    
    try:
        run_server()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        sys.exit(0)