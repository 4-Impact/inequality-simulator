#!/usr/bin/env python3
"""
Test script to check if the Render deployment is working
"""

import requests
import json

def test_endpoint(url, method='GET', data=None):
    """Test an API endpoint"""
    try:
        print(f"\n{'='*50}")
        print(f"Testing {method} {url}")
        print('='*50)
        
        if method == 'GET':
            response = requests.get(url, timeout=10)
        elif method == 'POST':
            response = requests.post(url, json=data, timeout=10)
        
        print(f"Status Code: {response.status_code}")
        print(f"Headers: {dict(response.headers)}")
        
        try:
            response_data = response.json()
            print(f"Response: {json.dumps(response_data, indent=2)}")
        except:
            print(f"Response Text: {response.text}")
            
        return response.status_code == 200
        
    except requests.exceptions.RequestException as e:
        print(f"ERROR: {e}")
        return False

def main():
    base_url = "https://inequality-simulator.onrender.com"
    api_base = f"{base_url}/api"
    
    print("Testing Render deployment...")
    
    # Test health endpoint
    test_endpoint(f"{api_base}/health")
    
    # Test status endpoint  
    test_endpoint(f"{api_base}/status")
    
    # Test initialize endpoint
    test_endpoint(f"{api_base}/initialize", method='POST', data={
        'policy': 'econophysics',
        'population': 100,
        'start_up_required': 1
    })
    
    # Test status again after initialization
    test_endpoint(f"{api_base}/status")
    
    print(f"\n{'='*50}")
    print("Testing complete!")
    print('='*50)

if __name__ == "__main__":
    main()
