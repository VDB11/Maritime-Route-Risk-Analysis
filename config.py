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
    
    # MarinePlan API settings
    MARINEPLAN_API_KEY = os.getenv('MARINEPLAN_API_KEY', '3104c7b9-fde7-44e9-abe2-e4676f0be304')
    MARINEPLAN_API_URL = "https://ais.marineplan.com/location/2/locations.json"
    
    # Ship tracking settings
    SHIP_MAX_AGE = 1800  # 30 minutes in seconds
    SHIP_RADIUS_FALLBACK_KM = 50  # Fallback radius when no ships found in bbox
    SHIP_TYPES_FILTER = ['CARGO_SHIP', 'TANKER']  # Only show these vessel types
    
    # Server configuration
    DEBUG = True
    HOST = '0.0.0.0'
    PORT = 5000