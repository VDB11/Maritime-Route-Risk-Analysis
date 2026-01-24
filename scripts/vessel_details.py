import asyncio
import aiohttp
from datetime import datetime, timezone
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderServiceError
import time
import requests
import searoute as sr
import pandas as pd

VF_HEADERS = {
    'sec-ch-ua-platform': '"Windows"',
    'Referer': 'https://www.vesselfinder.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
    'sec-ch-ua': '"Not(A:Brand";v="8", "Chromium";v="144", "Brave";v="144"',
    'sec-ch-ua-mobile': '?0'
}

# Load port data once at module level
try:
    PORT_DATA_DF = pd.read_csv('Data/port_details.csv')
except Exception as e:
    print(f"Error loading port data: {e}")
    PORT_DATA_DF = pd.DataFrame()

def epoch_to_utc_human(epoch_sec):
    """Convert epoch seconds to human-readable UTC format"""
    if not epoch_sec:
        return None
    try:
        dt = datetime.fromtimestamp(epoch_sec, tz=timezone.utc)
        return dt.strftime("%d %B %Y, %H:%M:%S UTC")
    except:
        return None

def clean_destination_name(destination):
    """Clean destination name by removing >> and > prefixes"""
    if not destination:
        return ""
    
    dest = destination.strip()
    
    # Handle >> separator
    if ">>" in dest:
        dest = dest.split(">>")[-1]
    # Handle > separator
    elif ">" in dest:
        dest = dest.split(">")[-1]
    
    return dest.strip()

def lookup_destination_in_csv(destination_name):
    """Look up destination coordinates in port_details.csv"""
    if PORT_DATA_DF.empty or not destination_name:
        return None, None
    
    # Clean the destination name
    dest_clean = clean_destination_name(destination_name).lower()
    dest_nospace = dest_clean.replace(" ", "")
    
    # Search in port_name, alt_name, and port_code
    for _, row in PORT_DATA_DF.iterrows():
        port_name = str(row.get('port_name', '')).strip().lower()
        port_name_nospace = port_name.replace(" ", "")
        
        alt_name = str(row.get('alt_name', '')).strip().lower()
        alt_name_nospace = alt_name.replace(" ", "")
        
        port_code = str(row.get('port_code', '')).strip().lower()
        port_code_nospace = port_code.replace(" ", "")
        
        # Check for matches
        if (dest_clean == port_name or dest_nospace == port_name_nospace or
            dest_clean == alt_name or dest_nospace == alt_name_nospace or
            dest_clean == port_code or dest_nospace == port_code_nospace or
            dest_clean in port_name or dest_nospace in port_name_nospace or
            dest_clean in alt_name or dest_nospace in alt_name_nospace):
            
            lat = row.get('lat')
            lon = row.get('lon')
            if pd.notna(lat) and pd.notna(lon):
                return float(lat), float(lon)
    
    return None, None

def lookup_origin_in_csv(origin_name):
    """Look up origin coordinates in port_details.csv before using Nominatim"""
    if PORT_DATA_DF.empty or not origin_name:
        return None, None
    
    # Parse origin name - typically "Port Name, Country"
    origin_clean = origin_name.strip()
    parts = [p.strip() for p in origin_clean.split(',')]
    
    if len(parts) < 2:
        # No country part, can't match reliably
        return None, None
    
    port_part = parts[0].lower()
    country_part = parts[1].lower()
    
    # Remove common suffixes from port name
    port_search = port_part.replace(' anch.', '').replace(' anch', '').replace(' port', '').strip()
    port_search_nospace = port_search.replace(" ", "")
    
    # Search through CSV
    for _, row in PORT_DATA_DF.iterrows():
        # Get port names
        port_name = str(row.get('port_name', '')).strip().lower()
        port_name_nospace = port_name.replace(" ", "")
        
        alt_name = str(row.get('alt_name', '')).strip().lower()
        alt_name_nospace = alt_name.replace(" ", "")
        
        # Get country code
        country_code = str(row.get('country_code', '')).strip().lower()
        
        # Check if country matches
        country_matches = (
            country_part in country_code or 
            country_code in country_part or
            country_part in str(row.get('country', '')).lower()
        )
        
        if not country_matches:
            continue
        
        # Check if port name matches - ONLY check non-empty strings
        port_matches = (
            (port_search and port_search in port_name) or 
            (port_search_nospace and port_search_nospace in port_name_nospace) or
            (alt_name and port_search in alt_name) or 
            (alt_name_nospace and port_search_nospace in alt_name_nospace) or
            (port_name and port_name in port_search) or
            (alt_name and alt_name in port_search)
        )
        
        if port_matches:
            lat = row.get('lat')
            lon = row.get('lon')
            if pd.notna(lat) and pd.notna(lon):
                print(f"Found origin in CSV: {port_name} ({country_code}) - {lat}, {lon}")
                return float(lat), float(lon)
    
    return None, None

def geocode_origin(origin_name, max_retries=3):
    """Geocode origin name - first check CSV, then use Nominatim with port fallback"""
    if not origin_name:
        return None, None
    
    # First try CSV lookup
    csv_lat, csv_lon = lookup_origin_in_csv(origin_name)
    if csv_lat and csv_lon:
        return csv_lat, csv_lon
    
    # If not found in CSV, use Nominatim
    print(f"Origin not found in CSV, using Nominatim for: {origin_name}")
    nominatim = Nominatim(user_agent="research_app", timeout=20)
    
    # Try with "Port" appended first
    queries = [
        f"{origin_name} Port",
        origin_name
    ]
    
    for query in queries:
        for attempt in range(max_retries):
            try:
                location = nominatim.geocode(query, addressdetails=True)
                if location:
                    print(f"Found origin via Nominatim: {location.latitude}, {location.longitude}")
                    return location.latitude, location.longitude
                time.sleep(1)
            except (GeocoderTimedOut, GeocoderServiceError, requests.exceptions.ReadTimeout):
                if attempt < max_retries - 1:
                    time.sleep(2)
                continue
        time.sleep(1)
    
    return None, None

def calculate_sea_route(origin_lat, origin_lon, dest_lat, dest_lon):
    print(f"DEBUG: Calculating route from ({origin_lat}, {origin_lon}) to ({dest_lat}, {dest_lon})")
    try:
        route = sr.searoute([origin_lon, origin_lat], [dest_lon, dest_lat])
        print(f"DEBUG: Searoute returned: {route}")
        
        if route and hasattr(route, 'properties') and hasattr(route, 'geometry'):
            distance_nm = route.properties.get('length', 0)
            print(f"DEBUG: Distance: {distance_nm} NM")
            
            # Check if distance is valid
            if distance_nm <= 0:
                print("DEBUG: Invalid distance (0 or negative), route calculation failed")
                return None
            
            if hasattr(route.geometry, 'coordinates') and route.geometry.coordinates:
                coordinates = [(coord[1], coord[0]) for coord in route.geometry.coordinates]
                print(f"DEBUG: Got {len(coordinates)} waypoints")
                
                # Check if we have at least 2 waypoints
                if len(coordinates) < 2:
                    print("DEBUG: Not enough waypoints, route calculation failed")
                    return None
                
                # Force exact start and end points
                coordinates[0] = (origin_lat, origin_lon)
                coordinates[-1] = (dest_lat, dest_lon)
                
                return {
                    'distance_nm': distance_nm,
                    'distance_km': distance_nm * 1.852,
                    'coordinates': coordinates
                }
            else:
                print("DEBUG: Route has no geometry/coordinates")
        else:
            print("DEBUG: Route has no properties or geometry")
    except Exception as e:
        print(f"DEBUG ERROR in calculate_sea_route: {e}")
        import traceback
        traceback.print_exc()
    return None

async def fetch_origin_name(session, mmsi):
    url = f"https://www.vesselfinder.com/api/pub/pcext/v4/{mmsi}?d"
    try:
        async with session.get(url, headers=VF_HEADERS, timeout=5) as resp:
            data = await resp.json()
            if data:
                dp = data[0].get("dp", "")
                c = data[0].get("c", "").split(" (")[0]
                return f"{dp}, {c}" if dp or c else None
    except Exception as e:
        print(f"Error fetching origin for MMSI {mmsi}: {e}")
    return None

async def get_vessel_origin(mmsi):
    async with aiohttp.ClientSession() as session:
        return await fetch_origin_name(session, mmsi)

def enrich_vessel_with_origin(vessel_data, mmsi):
    """Add origin name, geocode, destination lookup, and routes to vessel data"""
    try:
        # Get origin name
        print(f"\n=== ENRICHING VESSEL {mmsi} ===")
        origin_name = asyncio.run(get_vessel_origin(mmsi))
        vessel_data['originName'] = origin_name
        print(f"Origin name: {origin_name}")
        
        # Geocode origin if available
        if origin_name:
            origin_lat, origin_lon = geocode_origin(origin_name)
            vessel_data['origin_lat'] = origin_lat
            vessel_data['origin_lon'] = origin_lon
            print(f"Origin coordinates: {origin_lat}, {origin_lon}")
            
            # Calculate route from origin to current position if we have both
            if origin_lat and origin_lon and vessel_data.get('point'):
                current_lat = vessel_data['point'].get('latitude')
                current_lon = vessel_data['point'].get('longitude')
                
                print(f"Current position: {current_lat}, {current_lon}")
                
                if current_lat and current_lon:
                    print(f"Attempting to calculate route from origin ({origin_lat}, {origin_lon}) to current position ({current_lat}, {current_lon})")
                    route = calculate_sea_route(origin_lat, origin_lon, current_lat, current_lon)
                    
                    if route:
                        print(f"SUCCESS: Route from origin calculated!")
                        print(f"  Distance: {route['distance_nm']:.2f} NM ({route['distance_km']:.2f} km)")
                        print(f"  Waypoints: {len(route['coordinates'])}")
                        vessel_data['route_from_origin'] = route
                    else:
                        print("WARNING: Route calculation returned None - no route found")
                else:
                    print("WARNING: Current position coordinates missing")
            else:
                print("WARNING: Missing data for route calculation:")
                print(f"  Origin lat/lon: {origin_lat}, {origin_lon}")
                print(f"  Has point data: {vessel_data.get('point') is not None}")
        else:
            print("WARNING: No origin name available")
        
        # Look up destination coordinates from CSV
        destination_name = vessel_data.get('destinationName')
        print(f"\nDestination name: {destination_name}")
        
        if destination_name:
            dest_lat, dest_lon = lookup_destination_in_csv(destination_name)
            print(f"Destination coordinates from CSV: {dest_lat}, {dest_lon}")
            
            if dest_lat and dest_lon:
                # Store destination coordinates
                if 'destination' not in vessel_data:
                    vessel_data['destination'] = {}
                vessel_data['destination']['latitude'] = dest_lat
                vessel_data['destination']['longitude'] = dest_lon
                
                # Calculate remaining route if we have current position
                if vessel_data.get('point'):
                    current_lat = vessel_data['point'].get('latitude')
                    current_lon = vessel_data['point'].get('longitude')
                    
                    if current_lat and current_lon:
                        print(f"Attempting to calculate remaining route from ({current_lat}, {current_lon}) to destination ({dest_lat}, {dest_lon})")
                        remaining_route = calculate_sea_route(current_lat, current_lon, dest_lat, dest_lon)
                        
                        if remaining_route:
                            print(f"SUCCESS: Remaining route calculated!")
                            print(f"  Distance: {remaining_route['distance_nm']:.2f} NM ({remaining_route['distance_km']:.2f} km)")
                            print(f"  Waypoints: {len(remaining_route['coordinates'])}")
                            vessel_data['remaining_route'] = remaining_route
                        else:
                            print("WARNING: Remaining route calculation returned None")
            else:
                print("WARNING: Destination not found in CSV")
        
        # Convert epoch timestamps to human-readable UTC
        if vessel_data.get('timeSecUtc'):
            vessel_data['timeSecUtc'] = epoch_to_utc_human(vessel_data['timeSecUtc'])
        
        if vessel_data.get('etaSecUtc'):
            vessel_data['etaSecUtc'] = epoch_to_utc_human(vessel_data['etaSecUtc'])
        
        print(f"=== ENRICHMENT COMPLETE ===\n")
        return vessel_data
    except Exception as e:
        print(f"ERROR enriching vessel data: {e}")
        import traceback
        traceback.print_exc()
        vessel_data['originName'] = None
        return vessel_data