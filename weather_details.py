import requests
from datetime import datetime

def get_weather_forecast(lat, lon):
    try:
        url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,wind_speed_10m&hourly=temperature_2m,wind_speed_10m&forecast_days=7"
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        # Process for next 5 days
        times = data['hourly']['time']
        temps = data['hourly']['temperature_2m']
        winds = data['hourly']['wind_speed_10m']
        
        daily_forecast = []
        days_processed = set()
        
        for i in range(len(times)):
            dt = datetime.fromisoformat(times[i].replace('Z', '+00:00'))
            date_key = dt.strftime("%Y-%m-%d")
            
            if date_key not in days_processed:
                if len(days_processed) >= 5:
                    break
                    
                day_data = {
                    'date': date_key,
                    'day_name': dt.strftime("%A"),
                    'temps': [],
                    'winds': []
                }
                
                for j in range(i, min(i+24, len(times))):
                    if datetime.fromisoformat(times[j].replace('Z', '+00:00')).strftime("%Y-%m-%d") == date_key:
                        day_data['temps'].append(temps[j])
                        day_data['winds'].append(winds[j])
                
                if day_data['temps']:
                    day_data['min_temp'] = min(day_data['temps'])
                    day_data['max_temp'] = max(day_data['temps'])
                    day_data['avg_temp'] = round(sum(day_data['temps']) / len(day_data['temps']), 1)
                    day_data['avg_wind'] = round(sum(day_data['winds']) / len(day_data['winds']), 1)
                    daily_forecast.append(day_data)
                    days_processed.add(date_key)
        
        return {
            'current': data['current'],
            'forecast': daily_forecast
        }
        
    except Exception as e:
        print(f"Weather API error: {e}")
        return None