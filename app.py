from flask import Flask, request, jsonify, render_template
from searoutes import load_port_data, get_water_bodies, get_countries_by_water_body, get_ports_by_water_body_and_country, calculate_sea_route, get_route_coordinates
from disaster import parse_gdacs_rss, get_nearby_disasters, get_events_along_route, get_disasters_with_ships, ALERT_COLORS
from ships import get_ships_in_bbox, get_ships_for_disasters, get_ships_near_port
from eca_mpa import fast_eca_mpa
from config import Config
import threading

app = Flask(__name__)

# Load port data once at startup
port_df = load_port_data()

# Load ECA/MPA data once at startup
print("Loading ECA/MPA data...")
fast_eca_mpa.load_data()
print("ECA/MPA data loaded successfully!")

def get_intersection_geojson(intersections):
    if not intersections:
        return None
    
    features = []
    for intersection in intersections:
        feature = {
            'type': 'Feature',
            'geometry': intersection['geometry'].__geo_interface__,
            'properties': {
                'type': intersection['type'],
                'name': intersection.get('name', 'Unknown Area')
            }
        }
        features.append(feature)
    
    return {
        'type': 'FeatureCollection',
        'features': features
    }

@app.route('/')
def index():
    return render_template('map.html')

@app.route('/api/water_bodies')
def get_water_bodies_api():
    water_bodies = get_water_bodies(port_df)
    return jsonify(water_bodies)

@app.route('/api/countries/<water_body>')
def get_countries_api(water_body):
    countries = get_countries_by_water_body(port_df, water_body)
    return jsonify(countries)

@app.route('/api/ports/<water_body>/<country_code>')
def get_ports_api(water_body, country_code):
    ports = get_ports_by_water_body_and_country(port_df, water_body, country_code)
    return jsonify(ports)

@app.route('/api/ships/<disaster_gdacs_id>')
def get_ships_for_disaster(disaster_gdacs_id):
    """Get ships within a specific disaster's bounding box"""
    try:
        # Get all current disasters
        disaster_events = parse_gdacs_rss()
        
        # Find the specific disaster
        target_disaster = None
        for disaster in disaster_events:
            if disaster['gdacs_id'] == disaster_gdacs_id:
                target_disaster = disaster
                break
        
        if not target_disaster:
            return jsonify({'error': 'Disaster not found'}), 404
        
        if not target_disaster.get('bbox'):
            return jsonify({'ships': [], 'message': 'No bounding box available for this disaster'})
        
        # Get ships within the disaster bbox
        ships = get_ships_in_bbox(target_disaster['bbox'], Config.MARINEPLAN_API_KEY)
        
        return jsonify({
            'disaster_info': {
                'title': target_disaster['title'],
                'gdacs_id': target_disaster['gdacs_id'],
                'event_type': target_disaster['event_type'],
                'alert_level': target_disaster['alert_level']
            },
            'ships': ships
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/route', methods=['POST'])
def calculate_route():
    data = request.json
    origin_port_code = data.get('origin_port')
    dest_port_code = data.get('dest_port')
    
    try:
        # Find port coordinates and details
        origin_port = port_df[port_df['port_code'] == origin_port_code].iloc[0]
        dest_port = port_df[port_df['port_code'] == dest_port_code].iloc[0]
        
        origin_coords = [origin_port['lat'], origin_port['lon']]
        dest_coords = [dest_port['lat'], dest_port['lon']]
        
        # Calculate route
        route = calculate_sea_route(origin_coords[0], origin_coords[1], dest_coords[0], dest_coords[1])
        
        if not route:
            return jsonify({'error': 'Failed to calculate route'}), 500
        
        # Extract route coordinates
        route_coords = get_route_coordinates(route)
        
        # Get disaster events
        disaster_events = parse_gdacs_rss()
        origin_disasters = get_nearby_disasters(origin_coords[0], origin_coords[1], disaster_events)
        dest_disasters = get_nearby_disasters(dest_coords[0], dest_coords[1], disaster_events)
        route_disasters = get_events_along_route(route_coords, disaster_events)

        print(f"Found {len(disaster_events)} total disasters")
        print(f"Origin disasters: {len(origin_disasters)}")
        print(f"Destination disasters: {len(dest_disasters)}")
        print(f"Route disasters: {len(route_disasters)}")
        
        
        # Get port congestion data (with error handling)
        try:
            origin_congestion = get_ships_near_port(origin_coords[0], origin_coords[1])
            dest_congestion = get_ships_near_port(dest_coords[0], dest_coords[1])
            print(f"Origin congestion: {origin_congestion}")
            print(f"Destination congestion: {dest_congestion}")
        except Exception as e:
            print(f"Error getting congestion data: {e}")
            origin_congestion = {'congested': False, 'ship_count': 0, 'error': str(e)}
            dest_congestion = {'congested': False, 'ship_count': 0, 'error': str(e)}
        
        # Check for ECA/MPA intersections
        eca_mpa_intersections = []
        if hasattr(fast_eca_mpa, 'loaded') and fast_eca_mpa.loaded and route_coords:
            eca_mpa_intersections = fast_eca_mpa.check_route_intersections(route_coords)
            print(f"Found {len(eca_mpa_intersections)} ECA/MPA intersections")
        else:
            print("ECA/MPA data not loaded yet")
        
        # Combine all disasters and get ship data
        all_disasters = []
        disaster_ids_seen = set()
        
        for disasters_list in [origin_disasters, dest_disasters, route_disasters]:
            for disaster in disasters_list:
                if disaster['gdacs_id'] not in disaster_ids_seen:
                    all_disasters.append(disaster)
                    disaster_ids_seen.add(disaster['gdacs_id'])

        disasters_with_bbox = [d for d in all_disasters if d.get('bbox')]
        print(f"Disasters with bounding boxes: {len(disasters_with_bbox)}")
        
        # Get ships for disasters that have bounding boxes
        disasters_with_ships = get_ships_for_disasters(all_disasters, Config.MARINEPLAN_API_KEY)
        print(f"Found {len(disasters_with_ships)} disasters with ships")
        
        # Prepare response with port details
        response = {
            'origin': {
                'name': origin_port['port_name'],
                'code': origin_port['port_code'],
                'harbor_size': origin_port.get('harbor_size', 'N/A'),
                'harbor_type': origin_port.get('harbor_type', 'N/A'),
                'lat': origin_coords[0],
                'lon': origin_coords[1],
                'disasters': origin_disasters,
                'congestion': origin_congestion  # Add congestion data
            },
            'destination': {
                'name': dest_port['port_name'],
                'code': dest_port['port_code'],
                'harbor_size': dest_port.get('harbor_size', 'N/A'),
                'harbor_type': dest_port.get('harbor_type', 'N/A'),
                'lat': dest_coords[0],
                'lon': dest_coords[1],
                'disasters': dest_disasters,
                'congestion': dest_congestion  # Add congestion data
            },
            'route': {
                'coordinates': route_coords,
                'length': route.properties['length'],
                'units': route.properties['units'],
                'disasters': route_disasters,
                'eca_mpa_intersections': len(eca_mpa_intersections) > 0
            },
            'alert_colors': ALERT_COLORS,
            'ships': disasters_with_ships,
            'eca_mpa_data': get_intersection_geojson(eca_mpa_intersections) if eca_mpa_intersections else None
        }
        
        return jsonify(response)
        
    except Exception as e:
        print(f"Error in route calculation: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=Config.DEBUG, host=Config.HOST, port=Config.PORT)