from flask import Flask, render_template

capitalism = Flask(__name__)

@capitalism.route('/')
def home():
    return render_template('capitalism.html')

if __name__ == '__main__':
    print("Starting Capitalism Simulation Server...")
    print("Open your browser to: http://127.0.0.1:7063")
    capitalism.run(debug=True, port=7063)