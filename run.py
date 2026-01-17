import sys
import os
import logging
from datetime import datetime

# Setup logging
log_dir = os.path.join(os.path.dirname(__file__), 'logs')
os.makedirs(log_dir, exist_ok=True)
log_file = os.path.join(log_dir, f'flask_{datetime.now().strftime("%Y%m%d")}.log')

logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(log_file),
        logging.StreamHandler(sys.stdout)
    ]
)

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'scripts'))

from app import app
from config import Config

if __name__ == '__main__':
    logging.info("Starting Maritime Route Risk Analysis...")
    logging.info(f"Server will be available at http://{Config.HOST}:{Config.PORT}")
    app.run(debug=Config.DEBUG, host=Config.HOST, port=Config.PORT)