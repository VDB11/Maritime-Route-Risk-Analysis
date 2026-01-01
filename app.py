from flask import Flask, request, jsonify, render_template
from searoutes import load_port_data, get_water_bodies, get_countries_by_water_body, get_ports_by_water_body_and_country, calculate_sea_route, get_route_coordinates
from disaster import parse_gdacs_rss, get_nearby_disasters, get_events_along_route, get_disasters_with_ships, ALERT_COLORS
from ships import get_ships_in_bbox, get_ships_for_disasters, get_ships_near_port
from eca_mpa import fast_eca_mpa
from weather_details import get_weather_forecast
from piracy_tracker import piracy_monitor
from check_chokepoint import get_chokepoints_on_route
from port_details import get_port_details_data
from config import Config
import threading
import requests
import pandas as pd
import concurrent.futures
from functools import partial

app = Flask(__name__, static_folder='static')

# Load port data once at startup
port_df = load_port_data()

ocean_regions_df = None
try:
    ocean_regions_df = pd.read_csv('Data/ocean_regions.csv')
    print(f"Loaded {len(ocean_regions_df)} ocean regions")
except Exception as e:
    print(f"Error loading ocean regions: {e}")

# Load ECA/MPA data once at startup
print("Loading ECA/MPA data...")
fast_eca_mpa.load_data()
print("ECA/MPA data loaded successfully!")

def get_intersection_geojson(intersections):
    if not intersections:
        return None
    
    features = []
    for intersection in intersections:
        # Clean up the name - replace underscores with spaces
        raw_name = intersection.get('name', 'Unknown Area')
        clean_name = raw_name.replace('_', ' ').strip()
        
        feature = {
            'type': 'Feature',
            'geometry': intersection['geometry'].__geo_interface__,
            'properties': {
                'type': intersection['type'],
                'name': clean_name,
                'raw_name': raw_name  
            }
        }
        features.append(feature)
    
    return {
        'type': 'FeatureCollection',
        'features': features
    }

@app.route('/')
def homepage():
    return render_template('homepage.html')

@app.route('/route_planner')
def route_planner():
    return render_template('index.html')

@app.route('/demo_map')
def demo_map():
    return render_template('demo_map.html')

@app.route('/port_details')
def port_details_page():
    return render_template('port_details.html')

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

@app.route('/api/ocean_regions')
def get_ocean_regions_api():
    try:
        if ocean_regions_df is not None:
            regions = ocean_regions_df.to_dict('records')
            return jsonify(regions)
        return jsonify([])
    except Exception as e:
        print(f"Error getting ocean regions: {e}")
        return jsonify([])

@app.route('/api/ships/<disaster_gdacs_id>')
def get_ships_for_disaster(disaster_gdacs_id):
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
        # Find port coordinates (FAST - keep sequential)
        origin_port = port_df[port_df['port_code'] == origin_port_code].iloc[0]
        dest_port = port_df[port_df['port_code'] == dest_port_code].iloc[0]
        
        origin_coords = [origin_port['lat'], origin_port['lon']]
        dest_coords = [dest_port['lat'], dest_port['lon']]
        
        # Calculate route (FAST - keep sequential)
        route = calculate_sea_route(origin_coords[0], origin_coords[1], dest_coords[0], dest_coords[1])
        
        if not route:
            return jsonify({'error': 'Failed to calculate route'}), 500
        
        route_coords = get_route_coordinates(route)
        chokepoints = get_chokepoints_on_route(route_coords)
        
        # RUN ALL SLOW OPERATIONS IN PARALLEL
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            # Submit all tasks at once
            future_disasters = executor.submit(parse_gdacs_rss)
            future_piracy = executor.submit(lambda: piracy_monitor.piracy_incidents)
            future_piracy_month = executor.submit(piracy_monitor.get_current_month_summary)
            future_origin_congestion = executor.submit(
                get_ships_near_port, 
                origin_coords[0], 
                origin_coords[1]
            )
            future_dest_congestion = executor.submit(
                get_ships_near_port, 
                dest_coords[0], 
                dest_coords[1]
            )
            
            # Wait for disaster data first (needed for next step)
            disaster_events = future_disasters.result()
            
            # Calculate nearby disasters
            origin_disasters = get_nearby_disasters(origin_coords[0], origin_coords[1], disaster_events)
            dest_disasters = get_nearby_disasters(dest_coords[0], dest_coords[1], disaster_events)
            route_disasters = get_events_along_route(route_coords, disaster_events)
            
            # Combine all disasters
            all_disasters = []
            disaster_ids_seen = set()
            
            for disasters_list in [origin_disasters, dest_disasters, route_disasters]:
                for disaster in disasters_list:
                    if disaster['gdacs_id'] not in disaster_ids_seen:
                        all_disasters.append(disaster)
                        disaster_ids_seen.add(disaster['gdacs_id'])
            
            # Get ships for disasters in parallel with ECA/MPA check
            future_disaster_ships = executor.submit(
                get_ships_for_disasters, 
                all_disasters, 
                Config.MARINEPLAN_API_KEY
            )
            
            # Check ECA/MPA if route exists
            eca_mpa_intersections = []
            if hasattr(fast_eca_mpa, 'loaded') and fast_eca_mpa.loaded and route_coords and len(route_coords) > 0:
                future_eca_mpa = executor.submit(
                    fast_eca_mpa.check_route_intersections, 
                    route_coords
                )
                try:
                    eca_mpa_intersections = future_eca_mpa.result()
                except Exception as e:
                    print(f"Error checking ECA/MPA intersections: {e}")
            
            # Collect all parallel results
            disasters_with_ships = future_disaster_ships.result()
            all_piracy_incidents = future_piracy.result()
            current_month_piracy = future_piracy_month.result()
            origin_congestion = future_origin_congestion.result()
            dest_congestion = future_dest_congestion.result()
        
        # Check collisions (needs ships data)
        collision_risk_present = False
        collision_count = 0
        
        if disasters_with_ships:
            from collision_detection import collision_detector
            for disaster_id in disasters_with_ships.keys():
                collisions = collision_detector.get_collisions_in_disaster_area(
                    disasters_with_ships, disaster_id
                )
                if collisions:
                    collision_risk_present = True
                    collision_count += len(collisions)
        
        # Prepare response
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
                'eca_mpa_intersections': len(eca_mpa_intersections) > 0,
                'chokepoints': chokepoints
            },
            'alert_colors': ALERT_COLORS,
            'ships': disasters_with_ships,
            'eca_mpa_data': get_intersection_geojson(eca_mpa_intersections) if eca_mpa_intersections else None,
            'enable_collision_check': len(disasters_with_ships) > 0,
            'collision_risk_present': collision_risk_present,
            'collision_count': collision_count,
            'piracy': {
                'incidents_near_route': len(all_piracy_incidents),
                'current_month_total': len(current_month_piracy),
                'incidents': all_piracy_incidents,
                'current_month_summary': current_month_piracy
            }
        }
        
        return jsonify(response)
        
    except Exception as e:
        print(f"Error in route calculation: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/vessels_in_area', methods=['POST'])
def get_vessels_in_area():
    try:
        data = request.json
        
        # Check if ocean region is specified
        if data.get('ocean_region'):
            region_name = data.get('ocean_region')
            if ocean_regions_df is not None:
                region = ocean_regions_df[ocean_regions_df['name'] == region_name]
                if not region.empty:
                    sw_lat = float(region.iloc[0]['min_Y'])
                    sw_lon = float(region.iloc[0]['min_X'])
                    ne_lat = float(region.iloc[0]['max_Y'])
                    ne_lon = float(region.iloc[0]['max_X'])
                else:
                    return jsonify({'success': False, 'error': 'Region not found'}), 404
            else:
                return jsonify({'success': False, 'error': 'Ocean regions not loaded'}), 500
        else:
            # Use manual bounds
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
        
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        api_data = response.json()
        
        filtered_reports = []
        for report in api_data.get('reports', []):
            vessel_type = report.get('vesselType')
            if vessel_type not in ['CARGO_SHIP', 'TANKER']:
                continue
                
            point = report.get('point', {})
            lat = point.get('latitude', 0)
            lon = point.get('longitude', 0)
            
            if lat == 0.0 or lon == 0.0:
                continue
            
            # STRICT: Verify ship is within bounds
            if not (sw_lat <= lat <= ne_lat and sw_lon <= lon <= ne_lon):
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
            'vessels': filtered_reports,
            'bounds': {
                'sw_lat': sw_lat,
                'sw_lon': sw_lon,
                'ne_lat': ne_lat,
                'ne_lon': ne_lon
            }
        })
        
    except Exception as e:
        print(f"Error fetching vessels: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

# Add new endpoint for disasters in area
@app.route('/api/disasters_in_area', methods=['POST'])
def get_disasters_in_area():
    try:
        data = request.json
        sw_lat = float(data.get('sw_lat'))
        sw_lon = float(data.get('sw_lon'))
        ne_lat = float(data.get('ne_lat'))
        ne_lon = float(data.get('ne_lon'))
        
        # Get all current disasters
        disaster_events = parse_gdacs_rss()
        
        # Get ships in the area first
        bbox = f"{sw_lat},{sw_lon};{ne_lat},{ne_lon}"
        url = "https://ais.marineplan.com/location/2/locations.json"
        params = {
            'area': bbox,
            'moving': 1,
            'maxage': 1800,
            'source': 'AIS',
            'key': Config.MARINEPLAN_API_KEY
        }
        
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        api_data = response.json()
        
        # Extract ship positions
        ship_positions = []
        for report in api_data.get('reports', []):
            point = report.get('point', {})
            lat = point.get('latitude', 0)
            lon = point.get('longitude', 0)
            if lat != 0.0 and lon != 0.0:
                ship_positions.append((lat, lon))
        
        # Filter disasters that contain at least one ship
        disasters_with_ships = []
        for disaster in disaster_events:
            if not disaster.get('is_current', False):
                continue
                
            has_ship_in_disaster = False
            
            # Check if any ship is in this disaster's bbox
            if disaster.get('bbox'):
                bbox = disaster['bbox']
                for ship_lat, ship_lon in ship_positions:
                    if (bbox['lat_min'] <= ship_lat <= bbox['lat_max'] and
                        bbox['lon_min'] <= ship_lon <= bbox['lon_max']):
                        has_ship_in_disaster = True
                        break
            
            if has_ship_in_disaster:
                disasters_with_ships.append(disaster)
        
        # Get ships for disasters that have bounding boxes
        disasters_with_ship_data = get_ships_for_disasters(disasters_with_ships, Config.MARINEPLAN_API_KEY)
        
        return jsonify({
            'success': True,
            'count': len(disasters_with_ships),
            'disasters': disasters_with_ships,
            'ships': disasters_with_ship_data
        })
        
    except Exception as e:
        print(f"Error getting disasters: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

# Add new endpoint for ECA/MPA in area
@app.route('/api/eca_mpa_in_area', methods=['POST'])
def get_eca_mpa_in_area():
    try:
        data = request.json
        sw_lat = float(data.get('sw_lat'))
        sw_lon = float(data.get('sw_lon'))
        ne_lat = float(data.get('ne_lat'))
        ne_lon = float(data.get('ne_lon'))
        
        # Get ships in the area first
        bbox = f"{sw_lat},{sw_lon};{ne_lat},{ne_lon}"
        url = "https://ais.marineplan.com/location/2/locations.json"
        params = {
            'area': bbox,
            'moving': 1,
            'maxage': 1800,
            'source': 'AIS',
            'key': Config.MARINEPLAN_API_KEY
        }
        
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        api_data = response.json()
        
        # Extract ship positions as Points
        from shapely.geometry import Point
        ship_points = []
        for report in api_data.get('reports', []):
            point = report.get('point', {})
            lat = point.get('latitude', 0)
            lon = point.get('longitude', 0)
            if lat != 0.0 and lon != 0.0:
                ship_points.append(Point(lon, lat))  # Note: shapely uses (lon, lat)
        
        eca_mpa_with_ships = []
        if hasattr(fast_eca_mpa, 'loaded') and fast_eca_mpa.loaded and len(ship_points) > 0:
            try:
                # Create a box path for the area
                area_coords = [
                    [sw_lat, sw_lon],
                    [sw_lat, ne_lon],
                    [ne_lat, ne_lon],
                    [ne_lat, sw_lon],
                    [sw_lat, sw_lon]
                ]
                all_eca_mpa = fast_eca_mpa.check_route_intersections(area_coords)
                
                # Filter to only areas that contain at least one ship
                for area in all_eca_mpa:
                    area_geometry = area['geometry']
                    for ship_point in ship_points:
                        if area_geometry.contains(ship_point):
                            eca_mpa_with_ships.append(area)
                            break  # Found a ship, move to next area
                
            except Exception as e:
                print(f"Error checking ECA/MPA in area: {e}")
        
        return jsonify({
            'success': True,
            'count': len(eca_mpa_with_ships),
            'eca_mpa': get_intersection_geojson(eca_mpa_with_ships) if eca_mpa_with_ships else None
        })
        
    except Exception as e:
        print(f"Error getting ECA/MPA: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/collisions/<disaster_gdacs_id>')
def get_collisions_for_disaster(disaster_gdacs_id):
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

@app.route('/api/weather')
def get_weather_api():
    lat = request.args.get('lat', type=float)
    lon = request.args.get('lon', type=float)
    
    if not lat or not lon:
        return jsonify({'error': 'Missing coordinates'}), 400
    
    weather_data = get_weather_forecast(lat, lon)
    
    if weather_data:
        return jsonify(weather_data)
    else:
        return jsonify({'error': 'Failed to fetch weather data'}), 500

@app.route('/vessel_tracking')
def vessel_tracking():
    return render_template('vessel_tracking.html')

@app.route('/api/disasters')
def get_disasters_api():
    try:
        disasters = parse_gdacs_rss()        
        current_disasters = []
        for disaster in disasters:
            # Check if the disaster is still current
            if disaster.get('is_current', False):
                if disaster.get('to_date'):
                    from datetime import datetime
                    try:
                        # Parse the date string
                        to_date_str = disaster['to_date']
                        to_date = datetime.strptime(to_date_str, '%a, %d %b %Y %H:%M:%S %Z')
                        current_time = datetime.utcnow()
                        
                        if to_date < current_time:
                            print(f"Skipping ended disaster: {disaster['title']} (ended on {to_date})")
                            continue
                    except ValueError as e:
                        print(f"Error parsing date {disaster['to_date']}: {e}")
                        pass
                
                current_disasters.append(disaster)
        
        print(f"Returning {len(current_disasters)} current disasters (filtered from {len(disasters)})")
        return jsonify(current_disasters)
        
    except Exception as e:
        print(f"Error getting disasters: {e}")
        return jsonify([])

@app.route('/api/detect_collisions', methods=['POST'])
def detect_collisions_api():
    try:
        data = request.json
        vessels = data.get('vessels', [])
        
        from collision_detection import collision_detector, Vessel
        
        # Convert to Vessel objects
        vessel_objects = []
        for v in vessels:
            vessel = Vessel(
                mmsi=v.get('mmsi', 'Unknown'),
                name=v.get('name', 'Unknown'),
                lat=v['lat'],
                lon=v['lon'],
                speed_kmh=v['speed_kmh'],
                bearing_deg=v['bearing_deg']
            )
            vessel_objects.append(vessel)
        
        # Detect collisions
        collisions = collision_detector.detect_collisions(vessel_objects)
        
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
        print(f"Error detecting collisions: {e}")
        return jsonify([])

@app.route('/api/chokepoint_ships', methods=['POST'])
def get_chokepoint_ships():
    from ships import calculate_bbox_around_point
    
    data = request.json
    chokepoints = data.get('chokepoints', [])

    if not chokepoints:
        return jsonify({'ships': {}})

    all_chokepoint_ships = {}
    
    for cp in chokepoints:
        lat = cp.get('lat')
        lon = cp.get('lon')
        name = cp.get('name')
        
        if lat is None or lon is None:
            continue

        # Get ALL ships within 10km
        bbox = calculate_bbox_around_point(lat, lon, 80)
        
        url = "https://ais.marineplan.com/location/2/locations.json"
        params = {
            'area': bbox,
            'maxage': 1800,
            'source': 'AIS',
            'key': Config.MARINEPLAN_API_KEY
        }
        
        try:
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            api_data = response.json()
            
            ships = []
            for report in api_data.get('reports', []):
                point = report.get('point', {})
                if point.get('latitude', 0) == 0.0 or point.get('longitude', 0) == 0.0:
                    continue
                
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
                ships.append(ship_info)
            
            all_chokepoint_ships[name] = ships
            
        except Exception as e:
            print(f"Error fetching ships for {name}: {e}")
            all_chokepoint_ships[name] = []
    
    return jsonify({'ships': all_chokepoint_ships})

@app.route('/api/port_details/<port_code>')
def get_port_details_api(port_code):
    """API endpoint for detailed port information."""
    try:
        # Use weather function from weather_details module
        from weather_details import get_weather_forecast
        
        result = get_port_details_data(
            port_df=port_df,
            port_code=port_code,
            weather_func=get_weather_forecast
        )
        
        if 'error' in result:
            return jsonify(result), 404 if 'not found' in str(result).lower() else 500
        
        return jsonify(result)
        
    except Exception as e:
        print(f"Error in port details API: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=Config.DEBUG, host=Config.HOST, port=Config.PORT)