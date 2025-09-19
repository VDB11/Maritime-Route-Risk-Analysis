import requests
import xml.etree.ElementTree as ET
from math import radians, sin, cos, sqrt, atan2
from config import Config
from ships import get_ships_for_disasters

# Namespace handling for XML parsing
namespaces = {
    'geo': 'http://www.w3.org/2003/01/geo/wgs84_pos#',
    'gdacs': 'http://www.gdacs.org'
}

# Event type mapping for better display
EVENT_TYPE_MAP = {
    'EQ': 'Earthquake',
    'TC': 'Tropical Cyclone',
    'FL': 'Flood',
    'VO': 'Volcano',
    'DR': 'Drought',
    'WF': 'Wildfire'
}

# Alert level colors
ALERT_COLORS = {
    'Red': 'red',
    'Orange': 'orange',
    'Green': 'green',
    '': 'gray'  # Default for no alert level
}

def haversine_distance(lat1, lon1, lat2, lon2):
    """Calculate the great circle distance between two points on Earth"""
    R = 6371  # Earth radius in km
    
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1-a))
    
    return R * c

def parse_gdacs_rss():
    """Parse GDACS RSS feed and extract events with geographic data"""
    try:
        response = requests.get(Config.GDACS_RSS_URL, timeout=10)
        response.raise_for_status()
        
        root = ET.fromstring(response.content)
        events = []
        
        for item in root.findall('.//item'):
            # Extract iscurrent field first
            is_current_elem = item.find('gdacs:iscurrent', namespaces)
            is_current = False
            
            if is_current_elem is not None and is_current_elem.text:
                is_current = is_current_elem.text.lower() == 'true'
            
            # Only process current events
            if not is_current:
                continue
                
            # Extract basic information
            title = item.find('title').text if item.find('title') is not None else 'No title'
            link = item.find('link').text if item.find('link') is not None else 'No link'
            pub_date = item.find('pubDate').text if item.find('pubDate') is not None else 'No date'
            
            # Extract GDACS ID from guid
            guid_elem = item.find('guid')
            gdacs_id = guid_elem.text if guid_elem is not None else 'N/A'
            
            # Extract event type
            event_type = None
            event_type_elem = item.find('gdacs:eventtype', namespaces)
            if event_type_elem is not None and event_type_elem.text:
                event_type = event_type_elem.text
            
            # Extract alert level
            alert_level = None
            alert_elem = item.find('gdacs:alertlevel', namespaces)
            if alert_elem is not None and alert_elem.text:
                alert_level = alert_elem.text
            
            # Extract fromdate and todate
            from_date = None
            to_date = None
            fromdate_elem = item.find('gdacs:fromdate', namespaces)
            todate_elem = item.find('gdacs:todate', namespaces)
            
            if fromdate_elem is not None and fromdate_elem.text:
                from_date = fromdate_elem.text
            if todate_elem is not None and todate_elem.text:
                to_date = todate_elem.text
            
            # Extract geographic data
            geo_point = item.find('geo:Point', namespaces)
            lat, lon = None, None
            
            if geo_point is not None:
                lat_elem = geo_point.find('geo:lat', namespaces)
                lon_elem = geo_point.find('geo:long', namespaces)
                lat = float(lat_elem.text) if lat_elem is not None and lat_elem.text else None
                lon = float(lon_elem.text) if lon_elem is not None and lon_elem.text else None
            
            # Extract bounding box
            bbox_elem = item.find('gdacs:bbox', namespaces)
            bbox = None
            if bbox_elem is not None and bbox_elem.text:
                try:
                    bbox_coords = list(map(float, bbox_elem.text.split()))
                    if len(bbox_coords) == 4:
                        bbox = {
                            'lon_min': bbox_coords[0],
                            'lon_max': bbox_coords[1],
                            'lat_min': bbox_coords[2],
                            'lat_max': bbox_coords[3]
                        }
                except ValueError:
                    bbox = None
            
            events.append({
                'title': title,
                'gdacs_id': gdacs_id,
                'link': link,
                'pub_date': pub_date,
                'event_type': event_type,
                'alert_level': alert_level,
                'from_date': from_date,
                'to_date': to_date,
                'lat': lat,
                'lon': lon,
                'bbox': bbox,
                'is_current': is_current
            })
        
        return events
        
    except Exception as e:
        print(f"Error parsing RSS: {e}")
        return []
    
def filter_current_events(events):
    """Filter events to only include current ones"""
    return [event for event in events if event.get('is_current', False)]

def get_nearby_disasters(lat, lon, events=None, threshold_km=500):
    """Find disasters near a given coordinate"""
    if events is None:
        events = parse_gdacs_rss()
    
    nearby_events = []
    
    for event in events:
        if event['lat'] is not None and event['lon'] is not None:
            distance = haversine_distance(lat, lon, event['lat'], event['lon'])
            if distance <= threshold_km:
                event['distance_km'] = distance
                nearby_events.append(event)
    
    return nearby_events

def get_events_along_route(route_coords, events=None, threshold_km=500):
    """Find disasters near any point along a route"""
    if events is None:
        events = parse_gdacs_rss()
    
    route_events = []
    
    for event in events:
        if event['lat'] is not None and event['lon'] is not None:
            # Check distance to each point in the route
            for point in route_coords:
                distance = haversine_distance(point[0], point[1], event['lat'], event['lon'])
                if distance <= threshold_km:
                    event['distance_km'] = distance
                    route_events.append(event)
                    break
    
    return route_events

def get_disasters_with_ships(disasters, api_key=None):
    """
    Get disaster information enriched with ship data for disasters that have bounding boxes
    
    Args:
        disasters: List of disaster events
        api_key: MarinePlan API key
    
    Returns:
        Tuple of (disasters, disaster_ships_mapping)
    """
    disaster_ships = get_ships_for_disasters(disasters, api_key)
    return disasters, disaster_ships