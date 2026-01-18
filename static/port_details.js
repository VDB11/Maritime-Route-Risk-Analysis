// Global variables
let map = null;
let shipMarkers = [];
let selectedShipIndex = -1;
let vesselsData = [];
let expectedArrivalsData = [];

// Toggle weather widget
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

// Toggle additional details
function toggleAdditionalDetails() {
    const details = document.getElementById('additional-details');
    const button = document.getElementById('collapse-btn');
    const icon = button.querySelector('i');
    
    if (details.classList.contains('show')) {
        details.classList.remove('show');
        icon.className = 'fas fa-chevron-down';
        button.innerHTML = '<i class="fas fa-chevron-down"></i> Show All Port Details';
    } else {
        details.classList.add('show');
        icon.className = 'fas fa-chevron-up';
        button.innerHTML = '<i class="fas fa-chevron-up"></i> Hide Details';
    }
}

// Get port code from URL
function getPortCodeFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('port_code');
}

// Initialize map with layers exactly like script.js
function initializeMap(lat, lon, portName) {
    if (map) {
        map.remove();
    }
    
    map = L.map('satellite-map', {
        center: [lat, lon],
        zoom: 13,
        minZoom: 2,
        maxZoom: 18
    });
    
    // Add multiple tile layers exactly like script.js
    const tileLayers = {
        "OpenStreetMap": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 19
        }),
        "CartoDB Dark": L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap contributors &copy; CartoDB',
            maxZoom: 20
        }),
        "Satellite": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Esri, Maxar, Earthstar Geographics',
            maxZoom: 19
        })
    };
    
    // Add layer control exactly like script.js
    const layerControl = L.control.layers(tileLayers, null, {
        position: 'topright'
    }).addTo(map);
    
    // Add default layer (Satellite)
    tileLayers["Satellite"].addTo(map);
    
    // Add port marker
    const portIcon = L.divIcon({
        className: 'port-marker',
        html: `<div style="background: #ff4444; width: 24px; height: 24px; border-radius: 50%; 
                       border: 3px solid white; box-shadow: 0 0 15px rgba(255, 68, 68, 0.8);"></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });
    
    L.marker([lat, lon], {icon: portIcon})
        .addTo(map)
        .bindPopup(`<strong>${portName}</strong><br>Port Location`);
    
    // Add 5km radius circle
    L.circle([lat, lon], {
        color: '#4facfe',
        fillColor: '#4facfe',
        fillOpacity: 0.1,
        radius: 5000,
        weight: 2
    }).addTo(map);
}

// Create just the icon (no marker)
function createShipIcon(ship, index, isSelected = false) {
    const vesselType = ship.vesselType || 'UNKNOWN';
    
    // Light green color
    let shipColor = '#2E7D32'; // LIGHT GREEN
    
    if (vesselType === 'TANKER') {
        shipColor = '#FFB366'; // Lighter orange for tankers
    } else if (vesselType === 'CARGO_SHIP') {
        shipColor = '#66B3FF'; // Lighter blue for cargo
    }
    
    const iconSize = isSelected ? 24 : 20;
    const iconShadow = isSelected ? '0 0 20px rgba(144, 238, 144, 0.8), 0 0 0 2px white' : '2px 2px 4px rgba(0,0,0,0.8)';
    const iconTransform = isSelected ? 'scale(1.2)' : 'scale(1)';
    
    return L.divIcon({
        className: 'ship-marker',
        html: `<i class="fas fa-ship" style="font-size: ${iconSize}px; color: ${shipColor}; text-shadow: ${iconShadow}; transform: ${iconTransform}; transition: all 0.3s ease;"></i>`,
        iconSize: [iconSize, iconSize],
        iconAnchor: [iconSize/2, iconSize/2],
        popupAnchor: [0, -iconSize/2]
    });
}

// Create ship marker with LIGHT GREEN color
function createShipMarker(ship, index, isSelected = false) {
    const shipIcon = createShipIcon(ship, index, isSelected);
    
    const vesselName = ship.boatName.replace(/_/g, ' ').trim();
    const destination = ship.destinationName ? ship.destinationName.replace(/_/g, ' ').trim() : 'Unknown';
    const vesselType = ship.vesselType || 'UNKNOWN';
    const formattedVesselType = vesselType === 'CARGO_SHIP' ? 'Cargo Ship' : 
                               vesselType === 'TANKER' ? 'Tanker' : vesselType;
    
    // Get ship color for popup
    let shipColor = '#2E7D32';
    if (vesselType === 'TANKER') {
        shipColor = '#FFB366';
    } else if (vesselType === 'CARGO_SHIP') {
        shipColor = '#66B3FF';
    }
    
    const popupHtml = `
    <div style="font-family: 'Roboto Slab', serif; min-width: 280px; max-width: 320px;">
        <div style="background: linear-gradient(135deg, ${shipColor} 0%, #333 100%); color: white; padding: 12px; border-radius: 8px 8px 0 0; margin: -8px -8px 12px -8px;">
            <h3 style="margin: 0; font-size: 16px; font-weight: 600; line-height: 1.3;">
                ${vesselName}
            </h3>
            <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;">
                ${formattedVesselType}
            </p>
        </div>
        
        <div style="margin-bottom: 12px;">
            <div style="display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: center; margin-bottom: 6px;">
                <div style="color: ${shipColor}; font-size: 12px; width: 20px;">
                    <i class="fas fa-fingerprint"></i>
                </div>
                <div>
                    <div style="font-weight: 600; color: #4a5568; font-size: 12px;">MMSI</div>
                    <div style="color: #2d3748; font-size: 13px;">${ship.mmsi || 'N/A'}</div>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: center; margin-bottom: 6px;">
                <div style="color: ${shipColor}; font-size: 12px; width: 20px;">
                    <i class="fas fa-flag"></i>
                </div>
                <div>
                    <div style="font-weight: 600; color: #4a5568; font-size: 12px;">Flag</div>
                    <div style="color: #2d3748; font-size: 13px;">${ship.country || 'N/A'}</div>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: center; margin-bottom: 6px;">
                <div style="color: ${shipColor}; font-size: 12px; width: 20px;">
                    <i class="fas fa-map-marker-alt"></i>
                </div>
                <div>
                    <div style="font-weight: 600; color: #4a5568; font-size: 12px;">Destination</div>
                    <div style="color: #2d3748; font-size: 13px;">${destination}</div>
                </div>
            </div>
        </div>
        
        <div style="margin-bottom: 12px; padding: 10px; background: #f8f9fa; border-radius: 6px;">
            <div style="display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: center; margin-bottom: 6px;">
                <div style="color: ${shipColor}; font-size: 12px; width: 20px;">
                    <i class="fas fa-location-dot"></i>
                </div>
                <div>
                    <div style="font-weight: 600; color: #4a5568; font-size: 12px;">Position</div>
                    <div style="color: #2d3748; font-size: 13px;">${ship.point.latitude.toFixed(4)}, ${ship.point.longitude.toFixed(4)}</div>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: center;">
                <div style="color: ${shipColor}; font-size: 12px; width: 20px;">
                    <i class="fas fa-ruler-combined"></i>
                </div>
                <div>
                    <div style="font-weight: 600; color: #4a5568; font-size: 12px;">Dimensions</div>
                    <div style="color: #2d3748; font-size: 13px;">${ship.lengthMeters && ship.widthMeters ? 
                        `${ship.lengthMeters}m × ${ship.widthMeters}m` : 'N/A'}</div>
                </div>
            </div>
        </div>
        
        <div style="padding: 10px; background: #f8f9fa; border-radius: 6px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; text-align: center;">
                <div>
                    <div style="font-weight: 600; color: #4a5568; font-size: 11px; margin-bottom: 4px; display: flex; align-items: center; justify-content: center; gap: 4px;">
                        <i class="fas fa-gauge-high" style="color: ${shipColor}; font-size: 10px;"></i>
                        Speed
                    </div>
                    <div style="color: #2d3748; font-size: 13px; font-weight: 600;">${ship.speedKmh ? ship.speedKmh + ' km/h' : 'N/A'}</div>
                </div>
                
                <div>
                    <div style="font-weight: 600; color: #4a5568; font-size: 11px; margin-bottom: 4px; display: flex; align-items: center; justify-content: center; gap: 4px;">
                        <i class="fas fa-compass" style="color: ${shipColor}; font-size: 10px;"></i>
                        Bearing
                    </div>
                    <div style="color: #2d3748; font-size: 13px; font-weight: 600;">${ship.bearingDeg ? ship.bearingDeg + '°' : 'N/A'}</div>
                </div>
                
                <div>
                    <div style="font-weight: 600; color: #4a5568; font-size: 11px; margin-bottom: 4px; display: flex; align-items: center; justify-content: center; gap: 4px;">
                        <i class="fas fa-water" style="color: ${shipColor}; font-size: 10px;"></i>
                        Draught
                    </div>
                    <div style="color: #2d3748; font-size: 13px; font-weight: 600;">${ship.draughtMeters ? ship.draughtMeters + 'm' : 'N/A'}</div>
                </div>
            </div>
        </div>
        
        ${ship.imo ? `
        <div style="margin-top: 10px; padding: 8px; background: #e8f5e8; border-radius: 4px; border-left: 3px solid #4CAF50;">
            <div style="display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: center;">
                <div style="color: #4CAF50; font-size: 12px; width: 20px;">
                    <i class="fas fa-id-card"></i>
                </div>
                <div>
                    <div style="font-weight: 600; color: #4a5568; font-size: 12px;">IMO Number</div>
                    <div style="color: #2d3748; font-size: 13px;">${ship.imo}</div>
                </div>
            </div>
        </div>
        ` : ''}
    </div>
    `;

    const marker = L.marker([ship.point.latitude, ship.point.longitude], {
        icon: shipIcon
    }).bindPopup(popupHtml);
    
    // Add click handler directly to marker for map selection
    marker.on('click', function(e) {
        selectVessel(index);
    });
    
    return marker;
}

// Add ship markers to map
function addShipMarkers(ships) {
    // Clear existing ship markers
    shipMarkers.forEach(marker => {
        if (map.hasLayer(marker)) {
            map.removeLayer(marker);
        }
    });
    shipMarkers = [];
    
    if (!ships || ships.length === 0) return;
    
    vesselsData = ships;
    
    ships.forEach((ship, index) => {
        if (ship.point && ship.point.latitude && ship.point.longitude) {
            const marker = createShipMarker(ship, index, false);
            marker.addTo(map);
            shipMarkers.push(marker);
        }
    });
}

function selectVessel(index) {
    if (selectedShipIndex === index) {
        // Deselect if already selected
        deselectVessel();
        return;
    }
    
    // Deselect previous
    if (selectedShipIndex >= 0) {
        deselectVessel();
    }
    
    // Select new vessel
    selectedShipIndex = index;
    const ship = vesselsData[index];
    
    // Highlight on map
    const marker = shipMarkers[index];
    const newIcon = createShipIcon(ship, index, true);
    marker.setIcon(newIcon);
    
    // Open popup
    marker.openPopup();
    
    // Highlight in list
    const vesselItems = document.querySelectorAll('.vessel-item');
    vesselItems.forEach(item => {
        item.classList.remove('selected');
        item.style.zIndex = '1';
    });
    
    if (vesselItems[index]) {
        vesselItems[index].classList.add('selected');
        vesselItems[index].style.zIndex = '10';
        
        // Scroll to center of container
        const container = document.querySelector('.vessels-container');
        const item = vesselItems[index];
        const itemTop = item.offsetTop;
        const itemHeight = item.offsetHeight;
        const containerHeight = container.clientHeight;
        
        container.scrollTop = itemTop - (containerHeight / 2) + (itemHeight / 2);
    }
    
    // Pan to vessel (but not too close)
    map.setView([ship.point.latitude, ship.point.longitude], Math.max(map.getZoom(), 14), {
        animate: true,
        duration: 0.5
    });
}

// Deselect vessel
function deselectVessel() {
    if (selectedShipIndex >= 0 && selectedShipIndex < shipMarkers.length) {
        const ship = vesselsData[selectedShipIndex];
        const marker = shipMarkers[selectedShipIndex];
        const newIcon = createShipIcon(ship, selectedShipIndex, false);
        marker.setIcon(newIcon);
        marker.closePopup();
        
        // Remove highlight from list
        const vesselItems = document.querySelectorAll('.vessel-item');
        vesselItems.forEach(item => {
            item.classList.remove('selected');
            item.style.zIndex = '1';
        });
        
        selectedShipIndex = -1;
    }
}

// Format ship data for display
function formatShipData(ships) {
    if (!ships || ships.length === 0) {
        document.getElementById('vessel-count').textContent = '0';
        return '<div class="no-data">No vessels found within 5km radius</div>';
    }
    
    document.getElementById('vessel-count').textContent = ships.length;
    
    let html = '';
    
    ships.forEach((ship, index) => {
        const vesselName = ship.boatName.replace(/_/g, ' ').trim();
        const destination = ship.destinationName ? ship.destinationName.replace(/_/g, ' ').trim() : 'Unknown';
        const vesselType = ship.vesselType || 'Unknown';
        const isMoving = ship.moving || ship.speedKmh > 0.5;
        const statusClass = isMoving ? 'status-moving' : 'status-stationary';
        const statusText = isMoving ? 'Moving' : 'Stationary';
        
        html += `
            <div class="vessel-item" onclick="selectVessel(${index})" data-index="${index}">
                <div class="vessel-header">
                    <div class="vessel-name">${vesselName}</div>
                    <div class="vessel-type">${vesselType}</div>
                </div>
                <div class="vessel-details">
                    <div class="vessel-stat">
                        <span class="label">MMSI:</span>
                        <span class="value">${ship.mmsi || 'N/A'}</span>
                    </div>
                    <div class="vessel-stat">
                        <span class="label">Flag:</span>
                        <span class="value">${ship.country || 'N/A'}</span>
                    </div>
                    <div class="vessel-stat">
                        <span class="label">Speed:</span>
                        <span class="value">${ship.speedKmh ? ship.speedKmh.toFixed(1) : '0.0'} km/h</span>
                    </div>
                    <div class="vessel-stat">
                        <span class="label">Bearing:</span>
                        <span class="value">${ship.bearingDeg ? ship.bearingDeg + '°' : 'N/A'}</span>
                    </div>
                </div>
                <div class="vessel-footer">
                    <div class="vessel-status ${statusClass}">${statusText}</div>
                    <div class="vessel-distance">${ship.distance_km || '0.00'} km from port</div>
                </div>
            </div>
        `;
    });
    
    return html;
}

function formatBasicInfo(port) {
    const basic = port.basic_info;
    
    const tooltips = {
        'Country': 'The country where this port is located',
        'Water Body': 'The ocean, sea, or major water body where this port is situated',
        'Coordinates': 'Geographic coordinates (latitude, longitude) of the port location',
        'Harbor Size': 'Classification of the port based on its capacity and facilities (Small, Medium, Large, Very Large)',
        'Harbor Type': 'The type of harbor construction or natural formation (Coastal Natural, River, Artificial, etc.)'
    };
    
    return `
        <div class="port-detail-row">
            <span class="detail-label">
                Country
                <i class="fas fa-info-circle"></i>
                <span class="info-tooltip">${tooltips['Country']}</span>
            </span>
            <span class="detail-value">${basic.country_code}</span>
        </div>
        <div class="port-detail-row">
            <span class="detail-label">
                Water Body
                <i class="fas fa-info-circle"></i>
                <span class="info-tooltip">${tooltips['Water Body']}</span>
            </span>
            <span class="detail-value">${basic.water_body}</span>
        </div>
        <div class="port-detail-row">
            <span class="detail-label">
                Coordinates
                <i class="fas fa-info-circle"></i>
                <span class="info-tooltip">${tooltips['Coordinates']}</span>
            </span>
            <span class="detail-value">${basic.lat.toFixed(4)}, ${basic.lon.toFixed(4)}</span>
        </div>
        <div class="port-detail-row">
            <span class="detail-label">
                Harbor Size
                <i class="fas fa-info-circle"></i>
                <span class="info-tooltip">${tooltips['Harbor Size']}</span>
            </span>
            <span class="detail-value">${basic.harbor_size}</span>
        </div>
        <div class="port-detail-row">
            <span class="detail-label">
                Harbor Type
                <i class="fas fa-info-circle"></i>
                <span class="info-tooltip">${tooltips['Harbor Type']}</span>
            </span>
            <span class="detail-value">${basic.harbor_type}</span>
        </div>
    `;
}

function formatAdditionalDetails(port) {
    const nav = port.navigational_details;
    const limits = port.vessel_limits;
    const facilities = port.facilities;
    
    const tooltips = {
        'Sailing Direction': 'Official sailing directions publication reference for navigating to this port',
        'Nautical Chart': 'Official nautical chart number for this port area',
        'Tidal Range': 'The difference in height between high tide and low tide',
        'Entrance Width': 'Width of the main entrance channel to the harbor',
        'Channel Depth': 'Depth of the main navigation channel at mean low water',
        'Anchorage Depth': 'Water depth at designated anchorage areas',
        'Max Vessel Length': 'Maximum length of vessel that can be accommodated at the port',
        'Max Vessel Beam': 'Maximum beam (width) of vessel that can be accommodated',
        'Max Vessel Draft': 'Maximum draft (depth below waterline) of vessel that can enter',
        'Offshore Max Length': 'Maximum vessel length for offshore anchorage or operations',
        'Offshore Max Beam': 'Maximum vessel beam for offshore anchorage or operations',
        'Offshore Max Draft': 'Maximum vessel draft for offshore anchorage or operations',
        'Harbor Use': 'Primary purpose or use category of the harbor (Commercial, Militaryetc.)',
        'Port Security': 'Level of security measures and facilities at the port',
        'Search & Rescue': 'Availability of search and rescue services',
        'Medical Facilities': 'Availability of medical facilities and services at the port',
        'Ballast Disposal': 'Facilities available for dirty ballast water disposal',
        'Repairs': 'Level of ship repair capabilities',
        'Dry Dock': 'Size and capacity of dry dock facilities'
    };
    
    const createRow = (label, value) => `
        <div class="port-detail-row">
            <span class="detail-label">
                ${label}
                <i class="fas fa-info-circle"></i>
                <span class="info-tooltip">${tooltips[label]}</span>
            </span>
            <span class="detail-value small">${value}</span>
        </div>
    `;
    
    return `
        ${createRow('Sailing Direction', nav.sailing_direction)}
        ${createRow('Nautical Chart', nav.nautical_chart)}
        ${createRow('Tidal Range', nav.tidal_range ? nav.tidal_range + ' m' : 'N/A')}
        ${createRow('Entrance Width', nav.entrance_width ? nav.entrance_width + ' m' : 'N/A')}
        ${createRow('Channel Depth', nav.channel_depth ? nav.channel_depth + ' m' : 'N/A')}
        ${createRow('Anchorage Depth', nav.anchorage_depth ? nav.anchorage_depth + ' m' : 'N/A')}
        ${createRow('Max Vessel Length', limits.max_vessel_length ? limits.max_vessel_length + ' m' : 'N/A')}
        ${createRow('Max Vessel Beam', limits.max_vessel_beam ? limits.max_vessel_beam + ' m' : 'N/A')}
        ${createRow('Max Vessel Draft', limits.max_vessel_draft ? limits.max_vessel_draft + ' m' : 'N/A')}
        ${createRow('Offshore Max Length', limits.offshore_max_length ? limits.offshore_max_length + ' m' : 'N/A')}
        ${createRow('Offshore Max Beam', limits.offshore_max_beam ? limits.offshore_max_beam + ' m' : 'N/A')}
        ${createRow('Offshore Max Draft', limits.offshore_max_draft ? limits.offshore_max_draft + ' m' : 'N/A')}
        ${createRow('Harbor Use', facilities.harbor_use)}
        ${createRow('Port Security', facilities.port_security)}
        ${createRow('Search & Rescue', facilities.search_rescue)}
        ${createRow('Medical Facilities', facilities.medical_facilities)}
        ${createRow('Ballast Disposal', facilities.dirty_ballast_disposal)}
        ${createRow('Repairs', facilities.repairs)}
        ${createRow('Dry Dock', facilities.dry_dock)}
    `;
}

// Format weather data
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

function getPortTypeFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('type'); // returns 'origin', 'destination', or null
}

// Show expected arrivals popup
function showExpectedArrivals() {
    document.getElementById('expected-arrivals-popup').style.display = 'block';
    document.body.style.overflow = 'hidden';
}

// Close expected arrivals popup
function closeExpectedArrivals() {
    document.getElementById('expected-arrivals-popup').style.display = 'none';
    document.body.style.overflow = 'auto';
}

// Format expected arrivals list
function formatExpectedArrivals(ships) {
    if (!ships || ships.length === 0) {
        return '<div class="no-data">No expected arrivals</div>';
    }
    
    let html = '';
    
    ships.forEach((ship, index) => {
        const vesselName = ship.boatName.replace(/_/g, ' ').trim();
        const destination = ship.destinationName ? ship.destinationName.replace(/_/g, ' ').trim() : 'Unknown';
        const vesselType = ship.vesselType || 'Unknown';
        
        html += `
            <div class="vessel-item" style="cursor: default;">
                <div class="vessel-header">
                    <div class="vessel-name">${vesselName}</div>
                    <div class="vessel-type">${vesselType}</div>
                </div>
                <div class="vessel-details">
                    <div class="vessel-stat">
                        <span class="label">MMSI:</span>
                        <span class="value">${ship.mmsi || 'N/A'}</span>
                    </div>
                    <div class="vessel-stat">
                        <span class="label">Flag:</span>
                        <span class="value">${ship.country || 'N/A'}</span>
                    </div>
                    <div class="vessel-stat">
                        <span class="label">Destination:</span>
                        <span class="value">${destination}</span>
                    </div>
                    <div class="vessel-stat">
                        <span class="label">Speed:</span>
                        <span class="value">${ship.speedKmh ? ship.speedKmh.toFixed(1) : '0.0'} km/h</span>
                    </div>
                </div>
            </div>
        `;
    });
    
    return html;
}

// Setup map click handler for deselection
function setupMapClickHandler() {
    if (!map) return;
    
    map.on('click', function(e) {
    // Only deselect if not clicking on a marker or popup
        const clickedMarker = e.originalEvent.target.closest('.ship-marker') || 
                            e.originalEvent.target.closest('.leaflet-popup');
        if (!clickedMarker) {
            deselectVessel();
        }
    });
}

// Load port details
async function loadPortDetails() {
    const portCode = getPortCodeFromURL();
    if (!portCode) {
        showError('No port code specified in URL');
        return;
    }
    
    try {
        const response = await fetch(`/api/port_details/${portCode}`);
        const data = await response.json();
        
        if (!response.ok || data.error) {
            throw new Error(data.error || 'Failed to load port details');
        }
        
        // Hide loading
        document.getElementById('loading').style.display = 'none';
        
        // Update header
        document.getElementById('port-name').textContent = data.port.basic_info.port_name;
        document.getElementById('port-name-large').textContent = data.port.basic_info.port_name;
        document.getElementById('port-subtitle').textContent = `Port Code: ${data.port.basic_info.port_code}`;
        
        // Display basic info
        document.getElementById('basic-info').innerHTML = formatBasicInfo(data.port);
        
        // Display additional details
        document.getElementById('additional-details').innerHTML = formatAdditionalDetails(data.port);
        
        // Display ships
        document.getElementById('vessels-list').innerHTML = formatShipData(data.ships.ships);
        
        // Display expected arrivals ONLY for destination ports
        const portType = getPortTypeFromURL();
        if (portType === 'destination' && data.expected_arrivals) {
            expectedArrivalsData = data.expected_arrivals.ships || [];
            
            // Add expected arrivals section in vessels card header area
            const expectedHTML = `
                <div class="expected-arrivals-section" onclick="showExpectedArrivals()">
                    <span class="expected-label">Expected Arrivals</span>
                    <span class="expected-value">
                        ${data.expected_arrivals.count}
                        <i class="fas fa-chevron-right"></i>
                    </span>
                </div>
            `;
            
            // Insert after vessel count header
            const vesselsCard = document.querySelector('.vessels-card h2');
            vesselsCard.insertAdjacentHTML('afterend', expectedHTML);
            
            // Populate popup content
            document.getElementById('expected-arrivals-list').innerHTML = formatExpectedArrivals(expectedArrivalsData);
        }
        
        // Display weather
        document.getElementById('weather-content').innerHTML = formatWeatherData(data.weather);
        
        // Initialize map and add ships
        initializeMap(data.port.basic_info.lat, data.port.basic_info.lon, data.port.basic_info.port_name);
        addShipMarkers(data.ships.ships);
        setupMapClickHandler();
        
        // Close weather by default
        document.getElementById('weather-content').classList.remove('show');
        
    } catch (error) {
        console.error('Error loading port details:', error);
        showError(`Failed to load port details: ${error.message}`);
    }
}

// Show error
function showError(message) {
    document.getElementById('loading').style.display = 'none';
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `
        <i class="fas fa-exclamation-circle"></i>
        <h3>Error Loading Port Details</h3>
        <p>${message}</p>
        <button onclick="window.history.back()" class="back-button">
            <i class="fas fa-arrow-left"></i> Return to Route Planner
        </button>
    `;
    
    document.querySelector('.container').appendChild(errorDiv);
}

// Load on page load
document.addEventListener('DOMContentLoaded', function() {
    loadPortDetails();
});