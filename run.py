# tpike3/inequality-simulator/inequality-simulator-main/run.py

import os
import sys
import webbrowser
import time
import threading

def run_server():
    """Run the Flask backend server"""
    # Import app and the setup functions
    from app import app, init_gemini, setup_simulation
    
    print("=" * 60)
    print("Initializing Inequality Simulator Environment...")
    print("=" * 60)
    
    # 1. SETUP SIMULATION (This runs reset_logic_internal)
    # This guarantees we start with the original version (no user logic)
    setup_simulation()
    
    # 2. Initialize RAG Engine
    init_gemini()
    
    print("\nBackend API will be available at: http://localhost:5000/api")
    print("Frontend will be available at: http://localhost:5000")
    print("\nPress Ctrl+C to stop the server")
    
    app.run(debug=True, use_reloader=False, host='0.0.0.0', port=5000)

def open_browser():
    """Open browser after a short delay"""
    time.sleep(2)
    webbrowser.open('http://localhost:5000')

if __name__ == "__main__":
    # Start browser opening in a separate thread
    browser_thread = threading.Thread(target=open_browser)
    browser_thread.daemon = True
    browser_thread.start()
    
    try:
        run_server()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        sys.exit(0)