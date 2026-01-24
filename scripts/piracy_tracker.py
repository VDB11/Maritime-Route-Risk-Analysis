import requests
from datetime import datetime, timedelta, timezone
from geopy.distance import geodesic

class PiracyMonitor:
    def __init__(self):
        self.url = "https://icc-ccs.org/wp-json/wpgmza/v1/features"
        self.piracy_incidents = []
        self.load_incidents()
    
    def load_incidents(self):
        try:
            data = requests.get(self.url, timeout=10).json()
            now = datetime.now(timezone.utc)
            cutoff = now - timedelta(days=150)
            
            for marker in data.get("markers", []):
                fields = {f["name"]: f["value"] for f in marker.get("custom_field_data", [])}
                date_str = fields.get("Date of Incident")
                
                if not date_str:
                    continue
                
                try:
                    incident_date = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
                except:
                    continue
                
                if incident_date >= cutoff:
                    # Parse coordinates from address field
                    address = marker.get('address', '')
                    lat, lon = self.parse_coordinates(address)
                    
                    if lat and lon:
                        incident = {
                            'date': date_str,
                            'incident_date': incident_date,
                            'address': address,
                            'lat': lat,
                            'lon': lon,
                            'incident_number': fields.get('Incident Number', ''),
                            'sitrep': fields.get("Sitrep:", "").strip(),
                            'location_desc': fields.get('Location', ''),
                            'incident_type': fields.get('Type of Incident', '')
                        }
                        self.piracy_incidents.append(incident)
            
            print(f"Loaded {len(self.piracy_incidents)} piracy incidents from last 90 days")
            
        except Exception as e:
            print(f"Error loading piracy incidents: {e}")
            self.piracy_incidents = []
    
    def parse_coordinates(self, address):
        try:
            if ',' in address:
                parts = address.split(',')
                if len(parts) >= 2:
                    lat = float(parts[0].strip())
                    lon = float(parts[1].strip())
                    return lat, lon
        except:
            pass
        return None, None
    
    def check_route_for_piracy(self, route_coords, radius_km=50):
        incidents_near_route = []
        
        for incident in self.piracy_incidents:
            for route_point in route_coords:
                distance = geodesic((route_point[0], route_point[1]), 
                                   (incident['lat'], incident['lon'])).km
                if distance <= radius_km:
                    incidents_near_route.append(incident)
                    break  # Found incident near this route point
        
        return incidents_near_route
    
    def get_current_month_summary(self):
        now = datetime.now(timezone.utc)
        current_month_start = datetime(now.year, now.month, 1).replace(tzinfo=timezone.utc)
        
        current_month_incidents = []
        for incident in self.piracy_incidents:
            if incident['incident_date'] >= current_month_start:
                current_month_incidents.append(incident)
        
        return current_month_incidents

piracy_monitor = PiracyMonitor()