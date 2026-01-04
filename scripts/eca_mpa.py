import geopandas as gpd
import pandas as pd
from shapely.geometry import LineString
from shapely.strtree import STRtree
import pickle
import os

class FastECAMPA:
    def __init__(self):
        self.data_file = "Data/eca_mpa_data.pkl"

        self.features = []       
        self.geometries = []      
        self.tree = None         
        self.loaded = False

    def load_data(self):
        if self.loaded:
            return

        if os.path.exists(self.data_file):
            try:
                self._load_data()
                print("Loaded ECA/MPA data + STRtree index")
                self.loaded = True
                return
            except Exception as e:
                print(f"Failed loading saved data; rebuilding. Reason: {e}")

        self._build_data()

    def _build_data(self):
        print("Building ECA/MPA STRtree index...")

        # Load shapefiles
        eca_gdf = gpd.read_file("Data/eca_reg14_sox_pm.zip")
        eca_gdf["type"] = "ECA"

        mpa_gdf = gpd.read_file("Data/marine_polygons.zip")
        mpa_gdf["type"] = "MPA"

        df = gpd.GeoDataFrame(pd.concat([eca_gdf, mpa_gdf], ignore_index=True))

        # Extract features + geometries
        self.features = []
        self.geometries = []

        for idx, row in df.iterrows():
            geom = row.geometry

            self.features.append({
                "geometry": geom,
                "type": row["type"],
                "name": row.get("name", f"{row['type']}_Area_{idx}"),
                "properties": {k: v for k, v in row.items() if k != "geometry"}
            })

            self.geometries.append(geom)

        # Build STRtree
        self.tree = STRtree(self.geometries)

        with open(self.data_file, "wb") as f:
            pickle.dump(self.features, f)

        self.loaded = True
        print(f"STRtree built with {len(self.features)} features")

    def _load_data(self):
        with open(self.data_file, "rb") as f:
            self.features = pickle.load(f)

        # Rebuild geometry list
        self.geometries = [feat["geometry"] for feat in self.features]

        # Rebuild index tree
        self.tree = STRtree(self.geometries)

    def check_route_intersections(self, route_coordinates):
        if not self.loaded:
            return []

        # Flip (lat,lon) → (lon,lat)
        route_line = LineString([(lon, lat) for lat, lon in route_coordinates])

        # Query tree for possible intersects
        possible_indices = self.tree.query(route_line)

        results = []
        for idx in possible_indices:
            feature = self.features[idx]
            
            if route_line.intersects(feature["geometry"]):
                results.append(feature)

        return results

def get_intersection_geojson(intersections):
    if not intersections:
        return None

    features = []
    for f in intersections:
        features.append({
            "type": "Feature",
            "geometry": f["geometry"].__geo_interface__,
            "properties": {
                "type": f["type"],
                "name": f["name"]
            }
        })

    return {"type": "FeatureCollection", "features": features}

# Global instance
fast_eca_mpa = FastECAMPA()