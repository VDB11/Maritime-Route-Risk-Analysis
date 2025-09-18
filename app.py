from flask import Flask, request, jsonify, render_template
from searoutes import load_port_data, get_water_bodies, get_countries_by_water_body, get_ports_by_water_body_and_country, calculate_sea_route, get_route_coordinates
from disaster import parse_gdacs_rss, get_nearby_disasters, get_events_along_route, get_disasters_with_ships, ALERT_COLORS
from ships import get_ships_in_bbox, get_ships_for_disasters
from config import Config

app = Flask(__name__)

# Load port data once at startup
port_df = load_port_data()

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
    for disaster in disasters_with_bbox:
        print(f"  - {disaster['title']}: {disaster['bbox']}")
    
    # Get ships for disasters that have bounding boxes
    disasters_with_ships = get_ships_for_disasters(all_disasters, Config.MARINEPLAN_API_KEY)
    print(f"Found {len(disasters_with_ships)} disasters with ships")
    for gdacs_id, ship_data in disasters_with_ships.items():
        print(f"Disaster {gdacs_id}: {len(ship_data.get('ships', []))} ships")
    
    # Prepare response with port details
    response = {
        'origin': {
            'name': origin_port['port_name'],
            'code': origin_port['port_code'],
            'harbor_size': origin_port.get('harbor_size', 'N/A'),
            'harbor_type': origin_port.get('harbor_type', 'N/A'),
            'lat': origin_coords[0],
            'lon': origin_coords[1],
            'disasters': origin_disasters
        },
        'destination': {
            'name': dest_port['port_name'],
            'code': dest_port['port_code'],
            'harbor_size': dest_port.get('harbor_size', 'N/A'),
            'harbor_type': dest_port.get('harbor_type', 'N/A'),
            'lat': dest_coords[0],
            'lon': dest_coords[1],
            'disasters': dest_disasters
        },
        'route': {
            'coordinates': route_coords,
            'length': route.properties['length'],
            'units': route.properties['units'],
            'disasters': route_disasters
        },
        'alert_colors': ALERT_COLORS,
        'ships': disasters_with_ships  # Ships organized by disaster GDACS ID
    }
    
    return jsonify(response)

if __name__ == '__main__':
    app.run(debug=Config.DEBUG, host=Config.HOST, port=Config.PORT)