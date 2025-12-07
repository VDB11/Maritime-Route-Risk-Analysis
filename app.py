from flask import Flask, request, jsonify, render_template
from searoutes import load_port_data, get_water_bodies, get_countries_by_water_body, get_ports_by_water_body_and_country, calculate_sea_route, get_route_coordinates
from disaster import parse_gdacs_rss, get_nearby_disasters, get_events_along_route, get_disasters_with_ships, ALERT_COLORS
from ships import get_ships_in_bbox, get_ships_for_disasters, get_ships_near_port
from eca_mpa import fast_eca_mpa
from config import Config
import threading
import requests

app = Flask(__name__, static_folder='static')

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
    return render_template('index.html')

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
        
        collision_risk_present = False
        collision_count = 0
        
        if disasters_with_ships:
            # Check if any disaster area has ships that could collide
            from collision_detection import collision_detector
            for disaster_id in disasters_with_ships.keys():
                collisions = collision_detector.get_collisions_in_disaster_area(
                    disasters_with_ships, disaster_id
                )
                if collisions:
                    collision_risk_present = True
                    collision_count += len(collisions)
                    print(f"Found {len(collisions)} collision risks in disaster area {disaster_id}")
        
        print(f"Total collision risks detected: {collision_count}")
        
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
                'congestion': origin_congestion
            },
            'destination': {
                'name': dest_port['port_name'],
                'code': dest_port['port_code'],
                'harbor_size': dest_port.get('harbor_size', 'N/A'),
                'harbor_type': dest_port.get('harbor_type', 'N/A'),
                'lat': dest_coords[0],
                'lon': dest_coords[1],
                'disasters': dest_disasters,
                'congestion': dest_congestion
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
            'eca_mpa_data': get_intersection_geojson(eca_mpa_intersections) if eca_mpa_intersections else None,
            'enable_collision_check': len(disasters_with_ships) > 0,
            'collision_risk_present': collision_risk_present,
            'collision_count': collision_count
        }
        
        return jsonify(response)
        
    except Exception as e:
        print(f"Error in route calculation: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/vessels_in_area', methods=['POST'])
def get_vessels_in_area():
    """Get vessels within a specified area with limit control"""
    try:
        data = request.json
        sw_lat = float(data.get('sw_lat'))
        sw_lon = float(data.get('sw_lon'))
        ne_lat = float(data.get('ne_lat'))
        ne_lon = float(data.get('ne_lon'))
        limit = int(data.get('limit', 0))
        
        bbox = f"{sw_lat},{sw_lon};{ne_lat},{ne_lon}"
        
        url = "https://ais.marineplan.com/location/2/locations.json"
        params = {
            'area': bbox,
            'moving': 1,
            'maxage': 1800,
            'source': 'AIS',
            'key': Config.MARINEPLAN_API_KEY
        }
        
        # Make sure requests is imported at the top of the file
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        filtered_reports = []
        for report in data.get('reports', []):
            vessel_type = report.get('vesselType')
            if vessel_type not in ['CARGO_SHIP', 'TANKER']:
                continue
                
            point = report.get('point', {})
            if point.get('latitude', 0) == 0.0 or point.get('longitude', 0) == 0.0:
                continue
            
            filtered_report = {
                'boatName': report.get('boatName', '').upper(),
                'mmsi': report.get('mmsi'),
                'country': report.get('country'),
                'vesselType': vessel_type,
                'point': point,
                'destinationName': report.get('destinationName', '').upper(),
                'speedKmh': report.get('speedKmh'),
                'bearingDeg': report.get('bearingDeg'),
                'draughtMeters': report.get('draughtMeters'),
                'lengthMeters': report.get('lengthMeters'),
                'widthMeters': report.get('widthMeters'),
                'imo': report.get('imo')
            }
            filtered_reports.append(filtered_report)
            
            if limit > 0 and len(filtered_reports) >= limit:
                break
        
        return jsonify({
            'success': True,
            'count': len(filtered_reports),
            'vessels': filtered_reports
        })
        
    except Exception as e:
        print(f"Error fetching vessels: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/collisions/<disaster_gdacs_id>')
def get_collisions_for_disaster(disaster_gdacs_id):
    """Get collision risks for ships in a specific disaster area"""
    try:
        # Get ships data for the disaster area
        from ships import get_ships_in_bbox
        from disaster import parse_gdacs_rss
        
        # Find the disaster by GDACS ID
        disasters = parse_gdacs_rss()
        target_disaster = None
        
        for disaster in disasters:
            if disaster['gdacs_id'] == disaster_gdacs_id:
                target_disaster = disaster
                break
        
        if not target_disaster or not target_disaster.get('bbox'):
            return jsonify([])
        
        # Get ships in the disaster area
        ships = get_ships_in_bbox(target_disaster['bbox'], Config.MARINEPLAN_API_KEY)
        
        # Convert to Vessel objects and detect collisions
        from collision_detection import collision_detector, Vessel
        
        vessels = []
        for ship in ships:
            vessel = Vessel(
                mmsi=ship.get('mmsi', 'Unknown'),
                name=ship.get('boatName', 'Unknown'),
                lat=ship['point']['latitude'],
                lon=ship['point']['longitude'],
                speed_kmh=ship.get('speedKmh', 0),
                bearing_deg=ship.get('bearingDeg', 0),
                length_meters=ship.get('lengthMeters'),
                width_meters=ship.get('widthMeters')
            )
            vessels.append(vessel)
        
        collisions = collision_detector.detect_collisions(vessels)
        
        # Convert to JSON-serializable format
        collisions_data = []
        for collision in collisions:
            collisions_data.append({
                'vessel_a': {
                    'mmsi': collision.vessel_a.mmsi,
                    'name': collision.vessel_a.name,
                    'lat': collision.vessel_a.lat,
                    'lon': collision.vessel_a.lon,
                    'speed_kmh': collision.vessel_a.speed_kmh,
                    'bearing_deg': collision.vessel_a.bearing_deg
                },
                'vessel_b': {
                    'mmsi': collision.vessel_b.mmsi,
                    'name': collision.vessel_b.name,
                    'lat': collision.vessel_b.lat,
                    'lon': collision.vessel_b.lon,
                    'speed_kmh': collision.vessel_b.speed_kmh,
                    'bearing_deg': collision.vessel_b.bearing_deg
                },
                'cpa_km': round(collision.cpa_km, 3),
                'tcpa_minutes': round(collision.tcpa_minutes, 1),
                'risk_level': collision.risk_level
            })
        
        return jsonify(collisions_data)
        
    except Exception as e:
        print(f"Error calculating collisions: {e}")
        return jsonify([])

if __name__ == '__main__':
    app.run(debug=Config.DEBUG, host=Config.HOST, port=Config.PORT)