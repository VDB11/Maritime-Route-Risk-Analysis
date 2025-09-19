import pandas as pd
import searoute as sr

# Load port data from CSV
def load_port_data():
    try:
        df = pd.read_csv('port_details.csv')
        return df
    except Exception as e:
        print(f"Error loading port data: {e}")
        return pd.DataFrame()

# Get unique water bodies from port data
def get_water_bodies(df):
    return sorted(df['water_body'].dropna().unique().tolist())

# Get countries for a specific water body
def get_countries_by_water_body(df, water_body):
    filtered = df[df['water_body'] == water_body]
    return sorted(filtered['country_code'].dropna().unique().tolist())

# Get ports for a specific water body and country
def get_ports_by_water_body_and_country(df, water_body, country_code):
    filtered = df[(df['water_body'] == water_body) & (df['country_code'] == country_code)]
    return filtered[['port_code', 'port_name']].to_dict('records')

# Calculate sea route between two points
def calculate_sea_route(origin_lat, origin_lon, dest_lat, dest_lon):
    origin = [origin_lon, origin_lat]
    destination = [dest_lon, dest_lat]
    
    try:
        route = sr.searoute(origin, destination)
        return route
    except Exception as e:
        print(f"Error calculating sea route: {e}")
        return None

# Extract coordinates from route geometry
def get_route_coordinates(route):
    if route and hasattr(route, 'geometry') and hasattr(route.geometry, 'coordinates'):
        # Convert from [lon, lat] to [lat, lon] for Folium
        return [(coord[1], coord[0]) for coord in route.geometry.coordinates]
    return []