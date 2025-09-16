from flask import Flask, request, jsonify, render_template
from searoutes import load_port_data, get_water_bodies, get_countries_by_water_body, get_ports_by_water_body_and_country, calculate_sea_route, get_route_coordinates
from disaster import parse_gdacs_rss, get_nearby_disasters, get_events_along_route, ALERT_COLORS
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
        'alert_colors': ALERT_COLORS
    }
    
    return jsonify(response)

if __name__ == '__main__':
    app.run(debug=Config.DEBUG, host=Config.HOST, port=Config.PORT)