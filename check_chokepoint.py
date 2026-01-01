import geopandas as gpd
from shapely.geometry import LineString

# Load chokepoints once
_chokepoints_gdf = None

def load_chokepoints():
    global _chokepoints_gdf
    if _chokepoints_gdf is None:
        _chokepoints_gdf = gpd.read_file(
            "zip://Data/chokepoints.zip"
        ).to_crs(epsg=4326)
    return _chokepoints_gdf


def get_chokepoints_on_route(route_coords):
    """
    route_coords: list of (lat, lon)
    returns: list of chokepoints if route passes within 10km
    """
    if not route_coords or len(route_coords) < 2:
        print("❌ No route coordinates provided")
        return []
    
    print(f"🗺️ Checking {len(route_coords)} route points for chokepoints")
    print(f"📍 First point: {route_coords[0]}")
    print(f"📍 Last point: {route_coords[-1]}")
    
    chokepoints = load_chokepoints()
    print(f"🔍 Loaded {len(chokepoints)} chokepoint polygons")

    # shapely expects lon, lat
    route_line = LineString([(lon, lat) for lat, lon in route_coords])
    print(f"📏 Route line created: {route_line.bounds}")

    hits = []
    for idx, row in chokepoints.iterrows():
        buffered_polygon = row.geometry.buffer(0.09)
        
        if route_line.intersects(buffered_polygon):
            c = row.geometry.centroid
            chokepoint_name = row.get("name", "Unknown")
            print(f"✅ HIT: {chokepoint_name}")
            hits.append({
                "name": chokepoint_name,
                "lat": c.y,
                "lon": c.x
            })
        else:
            # Check distance to see how close we are
            distance = route_line.distance(row.geometry)
            if distance < 1.0:  # If within 1 degree (~111km), log it
                print(f"🔸 Near miss: {row.get('name', 'Unknown')} - distance: {distance:.4f} degrees (~{distance*111:.1f}km)")

    print(f"🎯 Found {len(hits)} chokepoints on route")
    return hits