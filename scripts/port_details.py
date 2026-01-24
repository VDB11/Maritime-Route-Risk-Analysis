import requests
from geopy.distance import geodesic
from config import Config
import math

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

def get_port_details_data(port_df, port_code, weather_func=None):
    try:
        # Find port in the loaded dataframe
        port = port_df[port_df['port_code'] == port_code]
        
        if port.empty:
            return {'error': 'Port not found'}
        
        port_data = port.iloc[0].to_dict()
        
        # Get coordinates
        port_lat = port_data['lat']
        port_lon = port_data['lon']
        port_name = port_data.get('port_name', '')
        alt_name = port_data.get('alt_name', '')
        
        # Get ships within 5km radius
        ships_data = get_ships_near_port(port_lat, port_lon, radius_km=5, include_all_types=True)
        
        # Get expected arrivals
        expected_arrivals = get_expected_arrivals(
            port_lat=port_lat,
            port_lon=port_lon,
            port_name=port_name,
            port_code=port_code,
            alt_name=alt_name,
            radius_km=500, #control expected arrival radius here
            api_key=Config.MARINEPLAN_API_KEY
        )
        
        # Get weather forecast
        weather_data = {}
        if weather_func:
            weather_data = weather_func(port_lat, port_lon) or {}
        
        # Prepare port details from CSV columns
        port_details = {
            'basic_info': {
                'port_name': port_data.get('port_name', ''),
                'port_code': port_data.get('port_code', ''),
                'country_code': port_data.get('country_code', ''),
                'water_body': port_data.get('water_body', ''),
                'lat': port_lat,
                'lon': port_lon,
                'harbor_size': port_data.get('harbor_size', 'N/A'),
                'harbor_type': port_data.get('harbor_type', 'N/A')
            },
            'navigational_details': {
                'sailing_direction': port_data.get('Sailing Direction or Publication', 'N/A'),
                'nautical_chart': port_data.get('Standard Nautical Chart', 'N/A'),
                'tidal_range': port_data.get('Tidal Range (m)', 'N/A'),
                'entrance_width': port_data.get('Entrance Width (m)', 'N/A'),
                'channel_depth': port_data.get('Channel Depth (m)', 'N/A'),
                'anchorage_depth': port_data.get('Anchorage Depth (m)', 'N/A'),
                'cargo_pier_depth': port_data.get('Cargo Pier Depth (m)', 'N/A'),
                'oil_terminal_depth': port_data.get('Oil Terminal Depth (m)', 'N/A'),
                'lng_terminal_depth': port_data.get('Liquified Natural Gas Terminal Depth (m)', 'N/A')
            },
            'vessel_limits': {
                'max_vessel_length': port_data.get('Maximum Vessel Length (m)', 'N/A'),
                'max_vessel_beam': port_data.get('Maximum Vessel Beam (m)', 'N/A'),
                'max_vessel_draft': port_data.get('Maximum Vessel Draft (m)', 'N/A'),
                'offshore_max_length': port_data.get('Offshore Maximum Vessel Length (m)', 'N/A'),
                'offshore_max_beam': port_data.get('Offshore Maximum Vessel Beam (m)', 'N/A'),
                'offshore_max_draft': port_data.get('Offshore Maximum Vessel Draft (m)', 'N/A')
            },
            'facilities': {
                'harbor_use': port_data.get('Harbor Use', 'N/A'),
                'port_security': port_data.get('Port Security', 'N/A'),
                'search_rescue': port_data.get('Search and Rescue', 'N/A'),
                'medical_facilities': port_data.get('Medical Facilities', 'N/A'),
                'dirty_ballast_disposal': port_data.get('Dirty Ballast Disposal', 'N/A'),
                'repairs': port_data.get('Repairs', 'N/A'),
                'dry_dock': port_data.get('Dry Dock', 'N/A')
            }
        }
        
        return {
            'success': True,
            'port': port_details,
            'ships': ships_data,
            'expected_arrivals': expected_arrivals,
            'weather': weather_data,
            'statistics': {
                'total_ships': len(ships_data.get('ships', [])),
                'moving_ships': len([s for s in ships_data.get('ships', []) if s.get('moving', False)]),
                'stationary_ships': len([s for s in ships_data.get('ships', []) if not s.get('moving', True)])
            }
        }
        
    except Exception as e:
        print(f"Error getting port details: {e}")
        return {'error': str(e)}

def get_ships_near_port(port_lat, port_lon, radius_km=5, include_all_types=False, api_key=None):
    if not api_key:
        api_key = Config.MARINEPLAN_API_KEY
    
    # Calculate bounding box around port
    bbox = calculate_bbox_around_point(port_lat, port_lon, radius_km)
    
    url = "https://ais.marineplan.com/location/2/locations.json"
    params = {
        'area': bbox,
        'moving': 0,  # include both moving and stationary
        'maxage': 1800,
        'source': 'AIS',
        'key': api_key
    }
    
    try:
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()
        
        ships = []
        for report in data.get('reports', []):
            point = report.get('point', {})
            if point.get('latitude', 0) == 0.0 or point.get('longitude', 0) == 0.0:
                continue
            
            # Calculate actual distance from port
            distance = geodesic((port_lat, port_lon), 
                               (point['latitude'], point['longitude'])).km
            if distance <= radius_km:
                # Check if we should include all types or filter
                vessel_type = report.get('vesselType')
                if not include_all_types and vessel_type not in ['CARGO_SHIP', 'TANKER']:
                    continue
                
                ship_info = {
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
                    'imo': report.get('imo'),
                    'distance_km': round(distance, 2),
                    'moving': report.get('speedKmh', 0) > 0.5,
                    'status': 'Moving' if report.get('speedKmh', 0) > 0.5 else 'Stationary'
                }
                ships.append(ship_info)
        
        return {
            'ships': ships,
            'count': len(ships),
            'radius_km': radius_km,
            'port_coordinates': {'lat': port_lat, 'lon': port_lon}
        }
        
    except requests.RequestException as e:
        print(f"Error fetching ships near port: {e}")
        return {'ships': [], 'count': 0, 'error': str(e)}
    except Exception as e:
        print(f"Error processing ships near port: {e}")
        return {'ships': [], 'count': 0, 'error': str(e)}

def get_expected_arrivals(port_lat, port_lon, port_name, port_code, radius_km=500, api_key=None, alt_name=None):
    if not api_key:
        raise ValueError("API key is required")

    url = "https://ais.marineplan.com/location/2/locations.json"
    
    bbox = calculate_bbox_around_point(port_lat, port_lon, radius_km)
    
    params = {
        "area": bbox,
        "moving": 1,
        "maxage": 1800,
        "source": "AIS",
        "key": api_key
    }
    
    print(f"DEBUG: Searching in bbox: {bbox} around port ({port_lat}, {port_lon})")

    try:
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        reports = response.json().get("reports", [])
                
        expected_ships = []
        seen_mmsi = set()
        
        search_terms = []
        
        if port_name and str(port_name).strip():
            port_name_clean = str(port_name).strip().lower()
            search_terms.append(port_name_clean)                   
            search_terms.append(port_name_clean.replace(" ", ""))  
        
        if alt_name and str(alt_name).strip():
            alt_name_clean = str(alt_name).strip().lower()
            search_terms.append(alt_name_clean)                      
            search_terms.append(alt_name_clean.replace(" ", ""))   
        
        if port_code and str(port_code).strip():
            port_code_clean = str(port_code).strip().lower()
            search_terms.append(port_code_clean)                    
            search_terms.append(port_code_clean.replace(" ", ""))   
        
        search_terms = [term for term in search_terms if term]
                
        if not search_terms:
            return {"ships": [], "count": 0}

        match_count = 0
        no_match_count = 0
        
        for report in reports:
            mmsi = report.get("mmsi")
            if not mmsi or mmsi in seen_mmsi:
                continue

            point = report.get("point", {})
            lat, lon = point.get("latitude", 0), point.get("longitude", 0)
            if lat == 0 or lon == 0:
                continue

            if geodesic((port_lat, port_lon), (lat, lon)).km > radius_km:
                continue

            destination = (report.get("destinationName") or "").strip()
            if not destination:
                continue

            if ">>" in destination:
                destination = destination.split(">>")[-1]
            elif ">" in destination:
                destination = destination.split(">")[-1]
            destination = destination.strip()
                
            dest_lower = destination.lower()
            dest_nospace = dest_lower.replace(" ", "")
            
            is_match = False
            matched_term = None
            for term in search_terms:
                if term in dest_lower or term in dest_nospace:
                    is_match = True
                    matched_term = term
                    match_count += 1
                    break

            if not is_match:
                no_match_count += 1
                continue

            seen_mmsi.add(mmsi)
            expected_ships.append({
                "boatName": report.get("boatName", "").upper(),
                "mmsi": mmsi,
                "vesselType": report.get("vesselType"),
                "destinationName": destination.upper(),
                "point": point,
                "speedKmh": report.get("speedKmh"),
                "bearingDeg": report.get("bearingDeg"),
                "draughtMeters": report.get("draughtMeters"),
                "lengthMeters": report.get("lengthMeters"),
                "widthMeters": report.get("widthMeters"),
                "imo": report.get("imo")
            })
        
        print(f"DEBUG: Matches: {match_count}, No matches: {no_match_count}")
        print(f"DEBUG: Total expected arrivals: {len(expected_ships)}")
        
        return {"ships": expected_ships, "count": len(expected_ships)}

    except Exception as e:
        print(f"Error fetching expected arrivals: {e}")
        return {"ships": [], "count": 0}