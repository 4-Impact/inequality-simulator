from flask import Flask, render_template

communism = Flask(__name__)

@communism.route('/')
def home():
    return render_template('communism.html')

if __name__ == '__main__':
    print("Starting Communism Simulation Server...")
    print("Open your browser to: http://127.0.0.1:7061")
    communism.run(debug=True, port=7061)