from app import app
from config import Config

if __name__ == '__main__':
    print("Starting Maritime Route Risk Analysis...")
    print(f"Server will be available at http://{Config.HOST}:{Config.PORT}")
    app.run(debug=Config.DEBUG, host=Config.HOST, port=Config.PORT)