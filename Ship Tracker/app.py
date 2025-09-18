import os
import csv
import requests
import json
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

def load_ocean_regions():
    regions = []
    with open('ocean_regions.csv', 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            regions.append({
                'name': row['name'],
                'min_Y': float(row['min_Y']),
                'min_X': float(row['min_X']),
                'max_Y': float(row['max_Y']),
                'max_X': float(row['max_X'])
            })
    return regions

def get_vessels_for_region(region_name, limit=None):
    regions = load_ocean_regions()
    region = next((r for r in regions if r['name'] == region_name), None)
    
    if not region:
        return {"error": "Region not found"}
    
    sw_lat, sw_lon = region['min_Y'], region['min_X']
    ne_lat, ne_lon = region['max_Y'], region['max_X']
    
    bbox = f"{sw_lat},{sw_lon};{ne_lat},{ne_lon}"
    
    API_KEY = os.getenv('MARINEPLAN_API_KEY')
    if not API_KEY:
        API_KEY = '3104c7b9-fde7-44e9-abe2-e4676f0be304'
    
    url = "https://ais.marineplan.com/location/2/locations.json"
    params = {
        'area': bbox,
        'moving': 1,
        'maxage': 1800,
        'source': 'AIS',
        'key': API_KEY
    }
    
    response = requests.get(url, params=params)
    data = response.json()
    
    filtered_reports = []
    for report in data.get('reports', []):
        if report.get('vesselType') not in ['CARGO_SHIP', 'TANKER']:
            continue
        point = report.get('point', {})
        if point.get('latitude', 0) == 0.0 or point.get('longitude', 0) == 0.0:
            continue
        
        filtered_report = {
            'boatName': report.get('boatName', '').upper(),
            'mmsi': report.get('mmsi'),
            'country': report.get('country'),
            'vesselType': report.get('vesselType'),
            'point': point,
            'destinationName': report.get('destinationName', '').upper(),
            'boundingBox': report.get('boundingBox'),
            'speedKmh': report.get('speedKmh'),
            'bearingDeg': report.get('bearingDeg'),
            'draughtMeters': report.get('draughtMeters'),
            'lengthMeters': report.get('lengthMeters'),
            'widthMeters': report.get('widthMeters'),
            'imo': report.get('imo')
        }
        filtered_reports.append(filtered_report)
    
    # Apply limit if specified
    if limit and limit > 0:
        filtered_reports = filtered_reports[:limit]
    
    return {'reports': filtered_reports}

@app.route('/')
def index():
    regions = load_ocean_regions()
    return render_template('index.html', regions=regions)

@app.route('/get_vessels', methods=['POST'])
def get_vessels():
    region_name = request.form.get('region')
    limit = request.form.get('limit')
    
    # Convert limit to integer, use None if not provided or invalid
    try:
        limit = int(limit) if limit else None
    except ValueError:
        limit = None
    
    result = get_vessels_for_region(region_name, limit)
    
    # Save to file
    with open('filtered_vessels.json', 'w') as f:
        json.dump(result, f, indent=2)
    
    return jsonify(result)

if __name__ == '__main__':
    app.run(debug=True)