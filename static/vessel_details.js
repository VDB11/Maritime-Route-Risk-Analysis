let map = null;

function getMMSIFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('mmsi');
}

function toggleWeather() {
    const weatherContent = document.getElementById('weather-content');
    const weatherToggle = document.querySelector('.weather-toggle i');
    
    if (weatherContent.classList.contains('show')) {
        weatherContent.classList.remove('show');
        weatherToggle.className = 'fas fa-cloud-sun';
    } else {
        weatherContent.classList.add('show');
        weatherToggle.className = 'fas fa-times';
    }
}

function buildRoutePopup(vessel, type) {
    const origin = vessel.originName || 'Unknown';
    const destination = vessel.destinationName
        ? vessel.destinationName.replace(/_/g, ' ').trim()
        : 'Unknown';

    if (type === 'completed') {
        const coveredKm = vessel.route_from_origin?.distance_km;

        return `
            <div style="
                font-family: 'Roboto Slab', serif;
                min-width: 220px;
                background: white;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                overflow: hidden;
            ">
                <div style="
                    padding: 10px 12px;
                    background: #f8f9fa;
                    border-bottom: 1px solid #e2e8f0;
                ">
                    <div style="font-weight: 600; font-size: 14px; color: #2d3748;">
                        Completed Route
                    </div>
                </div>

                <div style="padding: 12px;">
                    <div style="margin-bottom: 8px;">
                        <div style="font-size: 12px; font-weight: 600; color: #4a5568;">Origin</div>
                        <div style="font-size: 13px; color: #2d3748;">${origin}</div>
                    </div>

                    <div>
                        <div style="font-size: 12px; font-weight: 600; color: #4a5568;">
                            Distance Covered
                        </div>
                        <div style="font-size: 14px; font-weight: 600; color: #2d3748;">
                            ${coveredKm != null ? coveredKm.toFixed(2) + ' km' : 'N/A'}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    if (type === 'remaining') {
        const remainingKm = vessel.remaining_route?.distance_km;

        let html = `
            <div style="
                font-family: 'Roboto Slab', serif;
                min-width: 220px;
                background: white;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                overflow: hidden;
            ">
                <div style="
                    padding: 10px 12px;
                    background: #f8f9fa;
                    border-bottom: 1px solid #e2e8f0;
                ">
                    <div style="font-weight: 600; font-size: 14px; color: #2d3748;">
                        Remaining Route
                    </div>
                </div>

                <div style="padding: 12px;">
                    <div style="margin-bottom: 8px;">
                        <div style="font-size: 12px; font-weight: 600; color: #4a5568;">
                            Destination
                        </div>
                        <div style="font-size: 13px; color: #2d3748;">
                            ${destination}
                        </div>
                    </div>

                    <div style="margin-bottom: 8px;">
                        <div style="font-size: 12px; font-weight: 600; color: #4a5568;">
                            Remaining Distance
                        </div>
                        <div style="font-size: 14px; font-weight: 600; color: #2d3748;">
                            ${remainingKm != null ? remainingKm.toFixed(2) + ' km' : 'N/A'}
                        </div>
                    </div>
        `;

        if (vessel.etaSecUtc && vessel.etaSecUtc !== 'N/A') {
            html += `
                <div>
                    <div style="font-size: 12px; font-weight: 600; color: #4a5568;">
                        ETA
                    </div>
                    <div style="font-size: 13px; color: #2d3748;">
                        ${vessel.etaSecUtc}
                    </div>
                </div>
            `;
        }

        html += `
                </div>
            </div>
        `;

        return html;
    }

    return '';
}

function initializeMap(lat, lon, vesselName, vessel) {
    console.log('=== VESSEL DATA DEBUG ===');
    console.log('Full vessel data:', vessel);
    console.log('Route from origin:', vessel.route_from_origin);
    console.log('Remaining route:', vessel.remaining_route);
    console.log('Origin lat/lon:', vessel.origin_lat, vessel.origin_lon);
    console.log('Current lat/lon:', lat, lon);
    console.log('========================');
    if (map) {
        map.remove();
    }
    
    map = L.map('vessel-map', {
        center: [lat, lon],
        zoom: 10,
        minZoom: 2,
        maxZoom: 18
    });
    
    const tileLayers = {
        "CartoDB Dark": L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap contributors &copy; CartoDB',
            maxZoom: 20
        }),
        "OpenStreetMap": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 19
        }),
        "Satellite": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Esri, Maxar, Earthstar Geographics',
            maxZoom: 19
        })
    };
    
    L.control.layers(tileLayers, null, {
        position: 'topright'
    }).addTo(map);
    
    tileLayers["CartoDB Dark"].addTo(map);
    
    const bounds = [];
    
    // Draw route from origin if available
    if (vessel.route_from_origin && vessel.route_from_origin.coordinates && vessel.route_from_origin.coordinates.length > 0) {

    // Visible route (unchanged)
        const routeLine = L.polyline(vessel.route_from_origin.coordinates, {
            color: '#0066ff',
            weight: 4,
            opacity: 0.8
        }).addTo(map);

        // Invisible hover hit-area
        const routeHover = L.polyline(vessel.route_from_origin.coordinates, {
            color: '#000',
            weight: 20,        // hover tolerance ONLY
            opacity: 0,        // invisible
            interactive: true
        }).addTo(map);

        routeHover.bindTooltip(buildRoutePopup(vessel, 'completed'), {
            sticky: true,
            direction: 'top',
            opacity: 0.95
        });

        bounds.push(...vessel.route_from_origin.coordinates);
    }

    
    // Draw remaining route if available
    if (vessel.remaining_route && vessel.remaining_route.coordinates && vessel.remaining_route.coordinates.length > 0) {

    // Visible route (unchanged)
        const remainingLine = L.polyline(vessel.remaining_route.coordinates, {
            color: '#FF9800',
            weight: 3,
            opacity: 0.7,
            dashArray: '5, 10'
        }).addTo(map);

        // Invisible hover hit-area
        const remainingHover = L.polyline(vessel.remaining_route.coordinates, {
            color: '#000',
            weight: 20,
            opacity: 0,
            interactive: true
        }).addTo(map);

        remainingHover.bindTooltip(buildRoutePopup(vessel, 'remaining'), {
            sticky: true,
            direction: 'top',
            opacity: 0.95
        });

        bounds.push(...vessel.remaining_route.coordinates);
    }

    
    // Origin marker
    if (vessel.origin_lat && vessel.origin_lon) {
        const originIcon = L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        });
        L.marker([vessel.origin_lat, vessel.origin_lon], {icon: originIcon})
            .addTo(map)
            .bindPopup(`<strong>Origin</strong><br>${vessel.originName || 'Unknown'}`);
        bounds.push([vessel.origin_lat, vessel.origin_lon]);
    }
    
    // Current position marker
    const vesselIcon = L.divIcon({
        className: 'vessel-marker',
        html: `<i class="fas fa-ship" style="font-size: 24px; color: #4facfe; text-shadow: 0 0 10px rgba(79, 172, 254, 0.8);"></i>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });

    // Create popup content for current position
    let popupContent = `<strong>${vesselName}</strong><br>Current Position`;

    // If destination name exists but no destination coordinates (not found in CSV)
    if (vessel.destinationName && (!vessel.destination || !vessel.destination.latitude || !vessel.destination.longitude)) {
        const cleanDestination = vessel.destinationName.replace(/_/g, ' ').trim();
        popupContent += `<br><br><strong>Destination:</strong> ${cleanDestination}`;
        
        if (vessel.etaSecUtc && vessel.etaSecUtc !== 'N/A') {
            popupContent += `<br><strong>ETA:</strong> ${vessel.etaSecUtc}`;
        }
    }

    L.marker([lat, lon], {icon: vesselIcon})
        .addTo(map)
        .bindPopup(popupContent)
        .openPopup();
    bounds.push([lat, lon]);
    
    // Destination marker if available
    if (vessel.destination && vessel.destination.latitude && vessel.destination.longitude) {
        const destIcon = L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        });
        L.marker([vessel.destination.latitude, vessel.destination.longitude], {icon: destIcon})
            .addTo(map)
            .bindPopup(`<strong>Destination</strong><br>${vessel.destinationName || 'Unknown'}`);
        bounds.push([vessel.destination.latitude, vessel.destination.longitude]);
    }
    
    // Fit map to show all markers and routes
    if (bounds.length > 0) {
        map.fitBounds(bounds, {padding: [50, 50]});
    } else {
        map.setView([lat, lon], 10);
    }
}

function formatWeatherData(weather) {
    if (!weather || !weather.current) {
        return `
            <div class="weather-current-horizontal">
                <div class="weather-item-horizontal">
                    <div class="weather-value-horizontal">--°C</div>
                    <div class="weather-label-horizontal">Temperature</div>
                </div>
                <div class="weather-item-horizontal">
                    <div class="weather-value-horizontal">-- km/h</div>
                    <div class="weather-label-horizontal">Wind Speed</div>
                </div>
            </div>
            <div class="forecast-horizontal">
                <div class="forecast-item-horizontal">
                    <div class="forecast-day-horizontal">--</div>
                    <div class="forecast-temp-horizontal">--°C</div>
                    <div class="forecast-wind-horizontal">-- km/h</div>
                </div>
            </div>
        `;
    }
    
    const current = weather.current;
    const forecast = weather.forecast || [];
    
    let forecastHTML = '';
    if (forecast.length > 0) {
        forecast.slice(0, 5).forEach(day => {
            forecastHTML += `
                <div class="forecast-item-horizontal">
                    <div class="forecast-day-horizontal">${day.day_name || '--'}</div>
                    <div class="forecast-temp-horizontal">${day.avg_temp || '--'}°C</div>
                    <div class="forecast-wind-horizontal">${day.avg_wind || '--'} km/h</div>
                </div>
            `;
        });
    }
    
    return `
        <div class="weather-current-horizontal">
            <div class="weather-item-horizontal">
                <div class="weather-value-horizontal">${current.temperature_2m || '--'}°C</div>
                <div class="weather-label-horizontal">Temperature</div>
            </div>
            <div class="weather-item-horizontal">
                <div class="weather-value-horizontal">${current.wind_speed_10m || '--'} km/h</div>
                <div class="weather-label-horizontal">Wind Speed</div>
            </div>
        </div>
        <div class="forecast-horizontal">
            ${forecastHTML}
        </div>
    `;
}

async function fetchWeather(lat, lon) {
    try {
        const response = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching weather:', error);
        return null;
    }
}

function formatRouteData(vessel) {
    let routeHTML = '';
    
    // Distance covered from origin
    if (vessel.route_from_origin) {
        const distanceCovered = vessel.route_from_origin.distance_nm;
        routeHTML += `
            <div class="vessel-detail-row">
                <span class="detail-label">Distance Covered</span>
                <span class="detail-value">${distanceCovered.toFixed(2)} NM (${vessel.route_from_origin.distance_km.toFixed(2)} km)</span>
            </div>
        `;
    }
    
    // Remaining distance or ETA
    if (vessel.remaining_route) {
        const remainingDistance = vessel.remaining_route.distance_nm;
        routeHTML += `
            <div class="vessel-detail-row">
                <span class="detail-label">Remaining Distance</span>
                <span class="detail-value">${remainingDistance.toFixed(2)} NM (${vessel.remaining_route.distance_km.toFixed(2)} km)</span>
            </div>
        `;
    } else if (vessel.etaSecUtc || vessel.destinationName) {
        if (vessel.etaSecUtc && vessel.etaSecUtc !== 'N/A') {
            routeHTML += `
                <div class="vessel-detail-row">
                    <span class="detail-label">ETA</span>
                    <span class="detail-value">${vessel.etaSecUtc}</span>
                </div>
            `;
        }
    }
    
    return routeHTML;
}

function formatVesselData(vessel) {
    const vesselName = vessel.boatName ? vessel.boatName.replace(/_/g, ' ').trim() : 'Unknown Vessel';
    const destination = vessel.destinationName ? vessel.destinationName.replace(/_/g, ' ').trim() : 'Unknown';
    const origin = vessel.originName || 'Unknown';
    const vesselType = vessel.vesselType ? vessel.vesselType.replace(/_/g, ' ').trim() : 'Unknown';
    
    return `
        <div class="vessel-detail-row">
            <span class="detail-label">
                Vessel Name
                <i class="fas fa-info-circle"></i>
                <span class="info-tooltip">Official name of the vessel as registered</span>
            </span>
            <span class="detail-value">${vesselName}</span>
        </div>
        <div class="vessel-detail-row">
            <span class="detail-label">
                Vessel Type
                <i class="fas fa-info-circle"></i>
                <span class="info-tooltip">Category of vessel (Cargo, Tanker, Passenger, etc.)</span>
            </span>
            <span class="detail-value">${vesselType}</span>
        </div>
        <div class="vessel-detail-row">
            <span class="detail-label">
                MMSI
                <i class="fas fa-info-circle"></i>
                <span class="info-tooltip">Maritime Mobile Service Identity - unique 9-digit number</span>
            </span>
            <span class="detail-value">${vessel.mmsi || 'N/A'}</span>
        </div>
        <div class="vessel-detail-row">
            <span class="detail-label">
                IMO Number
                <i class="fas fa-info-circle"></i>
                <span class="info-tooltip">International Maritime Organization unique identifier</span>
            </span>
            <span class="detail-value">${vessel.imo || 'N/A'}</span>
        </div>
        <div class="vessel-detail-row">
            <span class="detail-label">
                Call Sign
                <i class="fas fa-info-circle"></i>
                <span class="info-tooltip">International radio call sign assigned to vessel</span>
            </span>
            <span class="detail-value">${vessel.callSign || 'N/A'}</span>
        </div>
        <div class="vessel-detail-row">
            <span class="detail-label">
                Flag Country
                <i class="fas fa-info-circle"></i>
                <span class="info-tooltip">Country where the vessel is registered</span>
            </span>
            <span class="detail-value">${vessel.country || 'N/A'}</span>
        </div>
        <div class="vessel-detail-row">
            <span class="detail-label">
                Origin
                <i class="fas fa-info-circle"></i>
                <span class="info-tooltip">Port where the vessel started its journey</span>
            </span>
            <span class="detail-value">${origin}</span>
        </div>
        <div class="vessel-detail-row">
            <span class="detail-label">
                Destination
                <i class="fas fa-info-circle"></i>
                <span class="info-tooltip">Intended destination port</span>
            </span>
            <span class="detail-value">${destination}</span>
        </div>
        ${formatRouteData(vessel)}
        <div class="vessel-detail-row">
            <span class="detail-label">
                Current Position
                <i class="fas fa-info-circle"></i>
                <span class="info-tooltip">Current geographic coordinates (latitude, longitude)</span>
            </span>
            <span class="detail-value">${vessel.point?.latitude?.toFixed(4) || 'N/A'}, ${vessel.point?.longitude?.toFixed(4) || 'N/A'}</span>
        </div>
        <div class="vessel-detail-row">
            <span class="detail-label">
                Speed
                <i class="fas fa-info-circle"></i>
                <span class="info-tooltip">Current speed over ground in kilometers per hour</span>
            </span>
            <span class="detail-value">${vessel.speedKmh ? vessel.speedKmh + ' km/h' : 'N/A'}</span>
        </div>
        <div class="vessel-detail-row">
            <span class="detail-label">
                Bearing
                <i class="fas fa-info-circle"></i>
                <span class="info-tooltip">Current course direction in degrees (0° = North)</span>
            </span>
            <span class="detail-value">${vessel.bearingDeg ? vessel.bearingDeg + '°' : 'N/A'}</span>
        </div>
        <div class="vessel-detail-row">
            <span class="detail-label">
                Dimensions (L × W × H)
                <i class="fas fa-info-circle"></i>
                <span class="info-tooltip">Length × Width × Height in meters</span>
            </span>
            <span class="detail-value">${vessel.lengthMeters || 'N/A'} m × ${vessel.widthMeters || 'N/A'} m × ${vessel.heightMeters || 'N/A'} m</span>
        </div>
        <div class="vessel-detail-row">
            <span class="detail-label">
                Draught
                <i class="fas fa-info-circle"></i>
                <span class="info-tooltip">Depth of vessel below waterline in meters</span>
            </span>
            <span class="detail-value">${vessel.draughtMeters ? vessel.draughtMeters + ' m' : 'N/A'}</span>
        </div>
        <div class="vessel-detail-row">
            <span class="detail-label">
                Fuel Type
                <i class="fas fa-info-circle"></i>
                <span class="info-tooltip">Type of fuel used by the vessel</span>
            </span>
            <span class="detail-value">${vessel.fuelType || 'N/A'}</span>
        </div>
        <div class="vessel-detail-row">
            <span class="detail-label">
                Captain
                <i class="fas fa-info-circle"></i>
                <span class="info-tooltip">Name of the vessel's captain/master</span>
            </span>
            <span class="detail-value">${vessel.captain || 'N/A'}</span>
        </div>
        <div class="vessel-detail-row">
            <span class="detail-label">
                Phone
                <i class="fas fa-info-circle"></i>
                <span class="info-tooltip">Contact phone number for the vessel</span>
            </span>
            <span class="detail-value">${vessel.phone || 'N/A'}</span>
        </div>
        <div class="vessel-detail-row">
            <span class="detail-label">
                ATIS
                <i class="fas fa-info-circle"></i>
                <span class="info-tooltip">Automatic Transmitter Identification System code</span>
            </span>
            <span class="detail-value">${vessel.atis || 'N/A'}</span>
        </div>
        <div class="vessel-detail-row">
            <span class="detail-label">
                Last Position Update
                <i class="fas fa-info-circle"></i>
                <span class="info-tooltip">Timestamp of last position report</span>
            </span>
            <span class="detail-value">${vessel.timeSecUtc || 'N/A'}</span>
        </div>
        <div class="vessel-detail-row">
            <span class="detail-label">
                ETA
                <i class="fas fa-info-circle"></i>
                <span class="info-tooltip">Estimated Time of Arrival at destination</span>
            </span>
            <span class="detail-value">${vessel.etaSecUtc || 'N/A'}</span>
        </div>
        <div class="vessel-detail-row">
            <span class="detail-label">
                Destination Coordinates
                <i class="fas fa-info-circle"></i>
                <span class="info-tooltip">Geographic coordinates of destination port</span>
            </span>
            <span class="detail-value">${vessel.destination?.latitude?.toFixed(4) || 'N/A'}, ${vessel.destination?.longitude?.toFixed(4) || 'N/A'}</span>
        </div>
        <div class="vessel-detail-row">
            <span class="detail-label">
                Bounding Box
                <i class="fas fa-info-circle"></i>
                <span class="info-tooltip">Geographic bounding box of vessel's route area</span>
            </span>
            <span class="detail-value">${vessel.boundingBox ? `TL: ${vessel.boundingBox.topLeft?.latitude?.toFixed(4)}, ${vessel.boundingBox.topLeft?.longitude?.toFixed(4)} / BR: ${vessel.boundingBox.bottomRight?.latitude?.toFixed(4)}, ${vessel.boundingBox.bottomRight?.longitude?.toFixed(4)}` : 'N/A'}</span>
        </div>
    `;
}


async function loadVesselDetails() {
    const mmsi = getMMSIFromURL();
    if (!mmsi) {
        showError('No MMSI specified in URL');
        return;
    }
    
    try {
        const vesselDataStr = sessionStorage.getItem(`vessel_${mmsi}`);
        if (!vesselDataStr) {
            showError('Vessel data not found. Please return to route planner and try again.');
            return;
        }
        
        const vesselData = JSON.parse(vesselDataStr);
        
        const response = await fetch(`/api/vessel_details/${mmsi}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                vessel_data: vesselData
            })
        });
        
        const data = await response.json();
        
        if (!response.ok || data.error) {
            throw new Error(data.error || 'Failed to load vessel details');
        }
        
        document.getElementById('loading').style.display = 'none';
        
        const vessel = data.vessel;
        const vesselName = vessel.boatName ? vessel.boatName.replace(/_/g, ' ').trim() : 'Unknown Vessel';
        
        document.getElementById('vessel-name').textContent = vesselName;
        document.getElementById('vessel-name-large').textContent = vesselName;
        document.getElementById('vessel-subtitle').textContent = `MMSI: ${vessel.mmsi || 'N/A'}`;
        
        document.getElementById('vessel-info').innerHTML = formatVesselData(vessel);
        
        if (vessel.point && vessel.point.latitude && vessel.point.longitude) {
            initializeMap(vessel.point.latitude, vessel.point.longitude, vesselName, vessel);
            
            const weather = await fetchWeather(vessel.point.latitude, vessel.point.longitude);
            document.getElementById('weather-content').innerHTML = formatWeatherData(weather);
        }
        
        document.getElementById('weather-content').classList.remove('show');
        
    } catch (error) {
        console.error('Error loading vessel details:', error);
        showError(`Failed to load vessel details: ${error.message}`);
    }
}

function showError(message) {
    document.getElementById('loading').style.display = 'none';
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `
        <i class="fas fa-exclamation-circle"></i>
        <h3>Error Loading Vessel Details</h3>
        <p>${message}</p>
        <button onclick="window.close()" class="back-button">
            <i class="fas fa-times"></i> Close Tab
        </button>
    `;
    
    document.querySelector('.container').appendChild(errorDiv);
}

document.addEventListener('DOMContentLoaded', function() {
    loadVesselDetails();
});