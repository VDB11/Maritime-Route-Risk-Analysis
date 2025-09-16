# Configuration settings for the application
import os

class Config:
    # GDACS RSS feed URL
    GDACS_RSS_URL = "https://www.gdacs.org/xml/rss.xml"
    
    # Port data file
    PORT_DATA_FILE = 'port_details.csv'
    
    # Default map settings
    DEFAULT_MAP_LOCATION = [20, 0]
    DEFAULT_ZOOM = 2
    
    # Disaster proximity threshold (in km)
    DISASTER_PROXIMITY_THRESHOLD = 100
    
    # Server configuration
    DEBUG = True
    HOST = '0.0.0.0'
    PORT = 5000