from flask import Flask, render_template

econophysics = Flask(__name__)

@econophysics.route('/')
def home():
    return render_template('index.html')

if __name__ == '__main__':
    # Runs the server on localhost:5000
    print("Starting Flask server...")
    print("Open your browser to: http://127.0.0.1:7060")
    econophysics.run(debug=True, port=7060)