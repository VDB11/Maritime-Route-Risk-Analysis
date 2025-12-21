import os
import requests
import math
from geopy.distance import geodesic
from dotenv import load_dotenv

load_dotenv()

def calculate_centroid(sw_lat, sw_lon, ne_lat, ne_lon):
    center_lat = (sw_lat + ne_lat) / 2
    center_lon = (sw_lon + ne_lon) / 2
    return center_lat, center_lon

def calculate_bbox_around_point(lat, lon, radius_km):
    earth_radius = 6371
    lat_rad = math.radians(lat)
    delta_lat = (radius_km / earth_radius) * (180 / math.pi)
    delta_lon = (radius_km / (earth_radius * math.cos(lat_rad))) * (180 / math.pi)
    
    min_lat = lat - delta_lat
    max_lat = lat + delta_lat
    min_lon = lon - delta_lon
    max_lon = lon + delta_lon
    
    return f"{min_lat},{min_lon};{max_lat},{max_lon}"

def format_bbox_for_api(bbox_dict):
    return f"{bbox_dict['lat_min']},{bbox_dict['lon_min']};{bbox_dict['lat_max']},{bbox_dict['lon_max']}"

def get_ships_in_bbox(bbox_dict, api_key=None, radius_fallback_km=50):
    if not api_key:
        api_key = os.getenv('MARINEPLAN_API_KEY')
        if not api_key:
            api_key = '<YOUR MARINE API KEY>'
    
    api_bbox_format = format_bbox_for_api(bbox_dict)
    
    url = "https://ais.marineplan.com/location/2/locations.json"
    params = {
        'area': api_bbox_format,
        'moving': 1,
        'maxage': 1800,
        'source': 'AIS',
        'key': api_key
    }
    
    try:
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        # If no results, try with centroid and radius
        if not data.get('reports'):
            center_lat, center_lon = calculate_centroid(
                bbox_dict['lat_min'], bbox_dict['lon_min'],
                bbox_dict['lat_max'], bbox_dict['lon_max']
            )
            new_bbox = calculate_bbox_around_point(center_lat, center_lon, radius_fallback_km)
            params['area'] = new_bbox
            
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
        
        # Filter reports for relevant vessel types and valid coordinates
        filtered_reports = []
        for report in data.get('reports', []):
            vessel_type = report.get('vesselType')
            if vessel_type not in ['CARGO_SHIP', 'TANKER']:
                continue
                
            point = report.get('point', {})
            # Skip if coordinates are missing or zero
            if point.get('latitude', 0) == 0.0 or point.get('longitude', 0) == 0.0:
                continue
            
            filtered_report = {
                'boatName': report.get('boatName', '').upper(),
                'mmsi': report.get('mmsi'),
                'country': report.get('country'),
                'vesselType': vessel_type,
                'point': point,
                'destinationName': report.get('destinationName', '').upper(),
                'boundingBox': report.get('boundingBox'),
                'speedKmh': report.get('speedKmh'),
                'bearingDeg': report.get('bearingDeg'),
                'draughtMeters': report.get('draughtMeters'),
                'lengthMeters': report.get('lengthMeters'),
                'widthMeters': report.get('widthMeters'),
                'imo': report.get('imo')
            }
            filtered_reports.append(filtered_report)
        
        return filtered_reports
        
    except requests.RequestException as e:
        print(f"Error fetching ship data: {e}")
        return []
    except Exception as e:
        print(f"Error processing ship data: {e}")
        return []

def get_ships_for_disasters(disasters, api_key=None):
    disaster_ships = {}
    
    for disaster in disasters:
        if disaster.get('bbox') and all(key in disaster['bbox'] for key in ['lat_min', 'lat_max', 'lon_min', 'lon_max']):
            ships = get_ships_in_bbox(disaster['bbox'], api_key)
            if ships:
                disaster_ships[disaster['gdacs_id']] = {
                    'disaster_info': {
                        'title': disaster['title'],
                        'event_type': disaster['event_type'],
                        'alert_level': disaster['alert_level']
                    },
                    'ships': ships
                }
    
    return disaster_ships

def get_ships_near_port(port_lat, port_lon, radius_km=None, threshold=None, api_key=None):
    if not api_key:
        api_key = os.getenv('MARINEPLAN_API_KEY')
        if not api_key:
            api_key = '<YOUR MARINE API KEY>'
    
    if radius_km is None:
        from config import Config
        radius_km = Config.PORT_CONGESTION_RADIUS_KM
    
    if threshold is None:
        from config import Config
        threshold = Config.PORT_CONGESTION_THRESHOLD
    
    # Calculate bounding box around port
    bbox = calculate_bbox_around_point(port_lat, port_lon, radius_km)
    
    url = "https://ais.marineplan.com/location/2/locations.json"
    params = {
        'area': bbox,
        'moving': 0,  # include both moving and stationary ships
        'maxage': 1800,
        'source': 'AIS',
        'key': api_key
    }
    
    try:
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        filtered_ships = []
        for report in data.get('reports', []):
            point = report.get('point', {})
            if point.get('latitude', 0) == 0.0 or point.get('longitude', 0) == 0.0:
                continue
            
            # Check actual distance from port
            distance = geodesic((port_lat, port_lon), (point['latitude'], point['longitude'])).km
            if distance <= radius_km:
                ship_info = {
                    'boatName': report.get('boatName', '').upper(),
                    'mmsi': report.get('mmsi'),
                    'country': report.get('country'),
                    'vesselType': report.get('vesselType'),
                    'point': point,
                    'destinationName': report.get('destinationName', '').upper(),
                    'speedKmh': report.get('speedKmh'),
                    'bearingDeg': report.get('bearingDeg'),
                    'draughtMeters': report.get('draughtMeters'),
                    'lengthMeters': report.get('lengthMeters'),
                    'widthMeters': report.get('widthMeters'),
                    'imo': report.get('imo')
                }
                filtered_ships.append(ship_info)
        
        ship_count = len(filtered_ships)
        congested = ship_count > threshold
        
        return {
            'congested': congested,
            'ship_count': ship_count,
            'radius_km': radius_km,
            'threshold': threshold,
            'ships': filtered_ships
        }
        
    except requests.RequestException as e:
        print(f"Error fetching port congestion data: {e}")
        return {'congested': False, 'ship_count': 0, 'error': str(e), 'ships': []}
    except Exception as e:
        print(f"Error processing port congestion data: {e}")
        return {'congested': False, 'ship_count': 0, 'error': str(e), 'ships': []}