from flask import Flask, render_template

fascism = Flask(__name__)

@fascism.route('/')
def home():
    return render_template('fascism.html')

if __name__ == '__main__':
    print("Starting Fascism Simulation Server...")
    print("Open your browser to: http://127.0.0.1:7062")
    fascism.run(debug=True, port=7062)