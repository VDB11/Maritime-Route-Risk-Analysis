// Initialize the map
const map = L.map('map', {
    center: [20, 0],
    zoom: 2,
    minZoom: 2,
    maxZoom: 18,
    worldCopyJump: true
});

// Add base layers
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
}).addTo(map);

// Add multiple backup tile providers
const tileLayers = {
    "OpenStreetMap": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
    }),
    "OpenSeaMap": L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', {
        attribution: 'Map data: &copy; OpenSeaMap contributors',
        maxZoom: 18
    }),
    "ESRI Ocean": L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Esri Ocean Base',
        maxZoom: 16
    }),
    "CartoDB Dark": L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors &copy; CartoDB',
        maxZoom: 20
    })
};

// First, add the layer control (will appear on top)
const layerControl = L.control.layers(tileLayers, null, {
    position: 'topright'
}).addTo(map);

// Add default tile layer
tileLayers["OpenStreetMap"].addTo(map);

// Then add metadata icon (will appear below layer control)
const metadataControl = L.control({position: 'topright'});

metadataControl.onAdd = function(map) {
    const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
    div.innerHTML = `
        <a href="/demo_map" target="_blank" 
           style="display: flex; align-items: center; justify-content: center;
                  width: 36px; height: 36px; 
                  background: white; border-radius: 6px;
                  box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                  transition: all 0.2s ease;
                  color: #0066cc; text-decoration: none;"
           title="View Demo Map with Explanations"
           onmouseover="this.style.transform='scale(1.1)'; this.style.background='#f8f9fa';"
           onmouseout="this.style.transform='scale(1)'; this.style.background='white';">
            <i class="fas fa-info-circle" style="font-size: 20px;"></i>
        </a>
    `;
    return div;
};

// Add metadata control to map
metadataControl.addTo(map);

// Minimal spacing CSS
const style = document.createElement('style');
style.textContent = `
    .leaflet-control-custom {
        margin-top: 5px !important; /* Just enough to clear the layer control button */
    }
    .leaflet-control-custom a:hover {
        box-shadow: 0 3px 8px rgba(0,0,0,0.4);
    }
`;
document.head.appendChild(style);

// Set view with bounds to prevent extreme zoom
map.options.minZoom = 2;
map.options.maxZoom = 18;

// Global variables
let routeLayer = null;
let disasterMarkers = [];
let portMarkers = [];
let shipMarkers = [];
let collisionLines = [];
window.currentRouteCollisions = [];
let chokepointMarkers = [];
let chokepointShipMarkers = [];

// Alert color mapping
const alertColorMap = {
    'Red': '#ff4444',
    'Orange': '#ff8800', 
    'Green': '#44ff44',
    'Unknown': '#888888'
};

// Layer visibility management
let layerVisibility = {
    disasters: true,
    congestion: true,
    protected: true
    // vessels: true REMOVED
};

// Load water bodies on page load
fetch('/api/water_bodies')
    .then(response => response.json())
    .then(waterBodies => {
        const originSelect = document.getElementById('origin-water-body');
        const destSelect = document.getElementById('dest-water-body');
        
        waterBodies.forEach(waterBody => {
            const option1 = document.createElement('option');
            option1.value = waterBody;
            option1.textContent = waterBody;
            originSelect.appendChild(option1);
            
            const option2 = document.createElement('option');
            option2.value = waterBody;
            option2.textContent = waterBody;
            destSelect.appendChild(option2);
        });
    })
    .catch(error => {
        console.error('Error loading water bodies:', error);
    });

// Event listeners for water body selection
document.getElementById('origin-water-body').addEventListener('change', function() {
    const waterBody = this.value;
    const countrySelect = document.getElementById('origin-country');
    
    countrySelect.disabled = !waterBody;
    countrySelect.innerHTML = '<option value="">Select Country</option>';
    document.getElementById('origin-port').innerHTML = '<option value="">Select Port</option>';
    document.getElementById('origin-port').disabled = true;
    
    if (waterBody) {
        fetch(`/api/countries/${encodeURIComponent(waterBody)}`)
            .then(response => response.json())
            .then(countries => {
                countries.forEach(country => {
                    const option = document.createElement('option');
                    option.value = country;
                    option.textContent = country;
                    countrySelect.appendChild(option);
                });
            })
            .catch(error => {
                console.error('Error loading countries:', error);
            });
    }
    
    checkCalculateButton();
});

document.getElementById('dest-water-body').addEventListener('change', function() {
    const waterBody = this.value;
    const countrySelect = document.getElementById('dest-country');
    
    countrySelect.disabled = !waterBody;
    countrySelect.innerHTML = '<option value="">Select Country</option>';
    document.getElementById('dest-port').innerHTML = '<option value="">Select Port</option>';
    document.getElementById('dest-port').disabled = true;
    
    if (waterBody) {
        fetch(`/api/countries/${encodeURIComponent(waterBody)}`)
            .then(response => response.json())
            .then(countries => {
                countries.forEach(country => {
                    const option = document.createElement('option');
                    option.value = country;
                    option.textContent = country;
                    countrySelect.appendChild(option);
                });
            })
            .catch(error => {
                console.error('Error loading countries:', error);
            });
    }
    
    checkCalculateButton();
});

// Event listeners for country selection
document.getElementById('origin-country').addEventListener('change', function() {
    const waterBody = document.getElementById('origin-water-body').value;
    const country = this.value;
    const portSelect = document.getElementById('origin-port');
    
    portSelect.disabled = !country;
    portSelect.innerHTML = '<option value="">Select Port</option>';
    
    if (waterBody && country) {
        fetch(`/api/ports/${encodeURIComponent(waterBody)}/${encodeURIComponent(country)}`)
            .then(response => response.json())
            .then(ports => {
                ports.forEach(port => {
                    const option = document.createElement('option');
                    option.value = port.port_code;
                    option.textContent = port.port_name;
                    portSelect.appendChild(option);
                });
            })
            .catch(error => {
                console.error('Error loading ports:', error);
            });
    }
    
    checkCalculateButton();
});

document.getElementById('dest-country').addEventListener('change', function() {
    const waterBody = document.getElementById('dest-water-body').value;
    const country = this.value;
    const portSelect = document.getElementById('dest-port');
    
    portSelect.disabled = !country;
    portSelect.innerHTML = '<option value="">Select Port</option>';
    
    if (waterBody && country) {
        fetch(`/api/ports/${encodeURIComponent(waterBody)}/${encodeURIComponent(country)}`)
            .then(response => response.json())
            .then(ports => {
                ports.forEach(port => {
                    const option = document.createElement('option');
                    option.value = port.port_code;
                    option.textContent = port.port_name;
                    portSelect.appendChild(option);
                });
            })
            .catch(error => {
                console.error('Error loading ports:', error);
            });
    }
    
    checkCalculateButton();
});

// Event listener for port selection
document.getElementById('origin-port').addEventListener('change', checkCalculateButton);
document.getElementById('dest-port').addEventListener('change', checkCalculateButton);

// Check if calculate button should be enabled
function checkCalculateButton() {
    const originPort = document.getElementById('origin-port').value;
    const destPort = document.getElementById('dest-port').value;
    const calculateButton = document.getElementById('calculate-route');
    
    calculateButton.disabled = !(originPort && destPort);
}

// Function to clear all markers and layers
function clearMapLayers() {
    if (routeLayer) {
        map.removeLayer(routeLayer);
        routeLayer = null;
    }
    
    disasterMarkers.forEach(marker => {
        if (map.hasLayer(marker)) {
            map.removeLayer(marker);
        }
    });
    disasterMarkers = [];

    portMarkers.forEach(marker => {
        if (map.hasLayer(marker)) {
            map.removeLayer(marker);
        }
    });
    portMarkers = [];

    shipMarkers.forEach(marker => {
        if (map.hasLayer(marker)) {
            map.removeLayer(marker);
        }
    });
    shipMarkers = [];
    
    // Clear chokepoint markers and circles
    if (chokepointMarkers) {
        chokepointMarkers.forEach(marker => {
            if (map.hasLayer(marker)) {
                map.removeLayer(marker);
            }
        });
        chokepointMarkers = [];
    }
    
    // Clear chokepoint ships separately
    if (chokepointShipMarkers) {
        chokepointShipMarkers.forEach(marker => {
            if (map.hasLayer(marker)) {
                map.removeLayer(marker);
            }
        });
        chokepointShipMarkers = [];
    }
    
    // Clear stored route bounds
    window.currentRouteBounds = null;

    if (window.collisionLines) {
        window.collisionLines.forEach(line => {
            if (map.hasLayer(line)) {
                map.removeLayer(line);
            }
        });
        window.collisionLines = [];
    }
    
    // Clear collision data
    window.currentRouteCollisions = [];

    // Clear piracy markers
    if (window.piracyMarkers) {
        window.piracyMarkers.forEach(marker => {
            if (map.hasLayer(marker)) {
                map.removeLayer(marker);
            }
        });
        window.piracyMarkers = [];
    }
    
    // Clear ECA/MPA layer
    if (window.ecaMpaLayer) {
        if (map.hasLayer(window.ecaMpaLayer)) {
            map.removeLayer(window.ecaMpaLayer);
        }
        window.ecaMpaLayer = null;
    }
}

// Function to create ship markers (FOR DISASTER AREA SHIPS - KEEP)
function createShipMarker(ship) {
    const vesselType = ship.vesselType || 'UNKNOWN';
    
    // Format vessel type: CARGO_SHIP -> Cargo Ship, TANKER -> Tanker
    let formattedVesselType = vesselType;
    if (vesselType === 'CARGO_SHIP') {
        formattedVesselType = 'Cargo Ship';
    } else if (vesselType === 'TANKER') {
        formattedVesselType = 'Tanker';
    } else if (vesselType.includes('_')) {
        // For any other types with underscores
        formattedVesselType = vesselType.toLowerCase()
            .replace(/_/g, ' ')
            .replace(/\b\w/g, char => char.toUpperCase());
    }
    
    // Clean up ship name - replace underscores with spaces
    const rawShipName = ship.boatName || 'Unknown Vessel';
    const cleanShipName = rawShipName.replace(/_/g, ' ').trim();
    
    // Clean up destination
    const rawDestination = ship.destinationName || 'Unknown';
    const cleanDestination = rawDestination.replace(/_/g, ' ').trim();
    
    let shipColor = '#2196F3'; // Default blue for cargo ships
    
    if (vesselType === 'TANKER') {
        shipColor = '#FF9800'; // Orange for tankers
    }
    
    // Simpler icon without background - just the ship symbol
    const shipIcon = L.divIcon({
        className: 'ship-marker-simple',
        html: `<i class="fas fa-ship" style="font-size: 14px; color: ${shipColor};"></i>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        popupAnchor: [0, -10]
    });
    
    // Format the data for display
    const formattedSpeed = ship.speedKmh ? `${ship.speedKmh} km/h` : 'N/A';
    const formattedBearing = ship.bearingDeg ? `${ship.bearingDeg}°` : 'N/A';
    const formattedDraught = ship.draughtMeters ? `${ship.draughtMeters}m` : 'N/A';
    const formattedDimensions = ship.lengthMeters && ship.widthMeters ? 
        `${ship.lengthMeters}m × ${ship.widthMeters}m` : 'N/A';
    const formattedPosition = ship.point ? 
        `${ship.point.latitude?.toFixed(4) || 'N/A'}, ${ship.point.longitude?.toFixed(4) || 'N/A'}` : 'N/A';
    
    const popupHtml = `
    <div style="font-family: Arial, sans-serif; min-width: 280px; max-width: 320px;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%); color: white; padding: 12px; border-radius: 8px 8px 0 0; margin: -8px -8px 12px -8px;">
            <h3 style="margin: 0; font-size: 16px; font-weight: 600; line-height: 1.3;">
                ${cleanShipName}
            </h3>
            <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;">
                ${formattedVesselType}
            </p>
        </div>
        
        <!-- Basic Info Section -->
        <div style="margin-bottom: 12px;">
            <div style="display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: center; margin-bottom: 6px;">
                <div style="color: #2196F3; font-size: 12px; width: 20px;">
                    <i class="fas fa-fingerprint"></i>
                </div>
                <div>
                    <div style="font-weight: 600; color: #4a5568; font-size: 12px;">MMSI</div>
                    <div style="color: #2d3748; font-size: 13px;">${ship.mmsi || 'N/A'}</div>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: center; margin-bottom: 6px;">
                <div style="color: #2196F3; font-size: 12px; width: 20px;">
                    <i class="fas fa-flag"></i>
                </div>
                <div>
                    <div style="font-weight: 600; color: #4a5568; font-size: 12px;">Flag</div>
                    <div style="color: #2d3748; font-size: 13px;">${ship.country || 'N/A'}</div>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: center; margin-bottom: 6px;">
                <div style="color: #2196F3; font-size: 12px; width: 20px;">
                    <i class="fas fa-map-marker-alt"></i>
                </div>
                <div>
                    <div style="font-weight: 600; color: #4a5568; font-size: 12px;">Destination</div>
                    <div style="color: #2d3748; font-size: 13px;">${ship.destinationName || 'Unknown'}</div>
                </div>
            </div>
        </div>
        
        <!-- Position & Dimensions Section -->
        <div style="margin-bottom: 12px; padding: 10px; background: #f8f9fa; border-radius: 6px;">
            <div style="display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: center; margin-bottom: 6px;">
                <div style="color: #2196F3; font-size: 12px; width: 20px;">
                    <i class="fas fa-location-dot"></i>
                </div>
                <div>
                    <div style="font-weight: 600; color: #4a5568; font-size: 12px;">Position</div>
                    <div style="color: #2d3748; font-size: 13px;">${formattedPosition}</div>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: center;">
                <div style="color: #2196F3; font-size: 12px; width: 20px;">
                    <i class="fas fa-ruler-combined"></i>
                </div>
                <div>
                    <div style="font-weight: 600; color: #4a5568; font-size: 12px;">Dimensions</div>
                    <div style="color: #2d3748; font-size: 13px;">${formattedDimensions}</div>
                </div>
            </div>
        </div>
        
        <!-- Navigation Data Section - Horizontal Layout -->
        <div style="padding: 10px; background: #f8f9fa; border-radius: 6px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; text-align: center;">
                <!-- Speed -->
                <div>
                    <div style="font-weight: 600; color: #4a5568; font-size: 11px; margin-bottom: 4px; display: flex; align-items: center; justify-content: center; gap: 4px;">
                        <i class="fas fa-gauge-high" style="color: #2196F3; font-size: 10px;"></i>
                        Speed
                    </div>
                    <div style="color: #2d3748; font-size: 13px; font-weight: 600;">${formattedSpeed}</div>
                </div>
                
                <!-- Bearing -->
                <div>
                    <div style="font-weight: 600; color: #4a5568; font-size: 11px; margin-bottom: 4px; display: flex; align-items: center; justify-content: center; gap: 4px;">
                        <i class="fas fa-compass" style="color: #2196F3; font-size: 10px;"></i>
                        Bearing
                    </div>
                    <div style="color: #2d3748; font-size: 13px; font-weight: 600;">${formattedBearing}</div>
                </div>
                
                <!-- Draught -->
                <div>
                    <div style="font-weight: 600; color: #4a5568; font-size: 11px; margin-bottom: 4px; display: flex; align-items: center; justify-content: center; gap: 4px;">
                        <i class="fas fa-water" style="color: #2196F3; font-size: 10px;"></i>
                        Draught
                    </div>
                    <div style="color: #2d3748; font-size: 13px; font-weight: 600;">${formattedDraught}</div>
                </div>
            </div>
        </div>
        
        <!-- Additional Info (if available) -->
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
        
        <!-- Weather Forecast Section (MOVED TO BOTTOM) -->
        ${createWeatherSection(ship.point.latitude, ship.point.longitude).outerHTML}
    </div>
`;

    const marker = L.marker([ship.point.latitude, ship.point.longitude], {icon: shipIcon})
        .bindPopup(popupHtml);

    return marker;
}

// Function to create disaster markers with proper styling
function createDisasterMarker(disaster) {
    const alertLevel = disaster.alert_level || 'Unknown';
    const alertColor = alertColorMap[alertLevel] || alertColorMap['Unknown'];
    
    const disasterIcon = L.divIcon({
        className: `disaster-icon-${alertLevel.toLowerCase()}`,
        html: `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
                   <i class="fas fa-exclamation-triangle" style="color: white; font-size: 14px;"></i>
               </div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16]
    });
    
    const popupHtml = `
        <div style="font-family: Arial, sans-serif; min-width: 280px; max-width: 350px;">
            <div style="background: linear-gradient(135deg, #6a11cb 0%, #2575fc 100%); color: white; padding: 12px; border-radius: 8px 8px 0 0; margin: -10px -10px 15px -10px;">
                <h3 style="margin: 0; font-size: 16px; font-weight: 600;">${disaster.title}</h3>
            </div>
            
            <div style="display: grid; grid-template-columns: 30px 1fr; gap: 10px; align-items: center; margin-bottom: 8px;">
                <div style="background: #f0f7ff; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
                    <span style="font-size: 16px;">🌍</span>
                </div>
                <div>
                    <div style="font-weight: 600; color: #4a5568; font-size: 13px;">Event Type</div>
                    <div style="color: #2d3748; font-size: 14px;">${disaster.event_type}</div>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 30px 1fr; gap: 10px; align-items: center; margin-bottom: 8px;">
                <div style="background: #fff5f5; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
                    <span style="font-size: 16px;">⚠️</span>
                </div>
                <div>
                    <div style="font-weight: 600; color: #4a5568; font-size: 13px;">Alert Level</div>
                    <div style="color: #2d3748; font-size: 14px;">${disaster.alert_level || 'N/A'}</div>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 30px 1fr; gap: 10px; align-items: center; margin-bottom: 8px;">
                <div style="background: #e6fffa; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
                    <span style="font-size: 16px;">🔵</span>
                </div>
                <div>
                    <div style="font-weight: 600; color: #4a5568; font-size: 13px;">Status</div>
                    <div style="color: #2d3748; font-size: 14px;">${disaster.is_current ? 'Current' : 'Past Event'}</div>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 30px 1fr; gap: 10px; align-items: center; margin-bottom: 8px;">
                <div style="background: #f0fff4; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
                    <span style="font-size: 16px;">📅</span>
                </div>
                <div>
                    <div style="font-weight: 600; color: #4a5568; font-size: 13px;">From Date</div>
                    <div style="color: #2d3748; font-size: 14px;">${disaster.from_date || 'N/A'}</div>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 30px 1fr; gap: 10px; align-items: center; margin-bottom: 8px;">
                <div style="background: #fffaf0; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
                    <span style="font-size: 16px;">📅</span>
                </div>
                <div>
                    <div style="font-weight: 600; color: #4a5568; font-size: 13px;">To Date</div>
                    <div style="color: #2d3748; font-size: 14px;">${disaster.to_date || 'N/A'}</div>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 30px 1fr; gap: 10px; align-items: center; margin-bottom: 8px;">
                <div style="background: #faf5ff; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
                    <span style="font-size: 16px;">🆔</span>
                </div>
                <div>
                    <div style="font-weight: 600; color: #4a5568; font-size: 13px;">GDACS ID</div>
                    <div style="color: #2d3748; font-size: 14px;">${disaster.gdacs_id}</div>
                </div>
            </div>
            
            <div style="margin-top: 15px; border-top: 1px solid #e2e8f0; padding-top: 12px;">
                <a href="${disaster.link}" target="_blank" style="display: block; text-align: center; background: #4299e1; color: white; padding: 8px 12px; border-radius: 6px; text-decoration: none; font-weight: 500; font-size: 14px; transition: background 0.2s;">
                    View Details on GDACS
                </a>
            </div>
        </div>
    `;

    const marker = L.marker([disaster.lat, disaster.lon], {icon: disasterIcon})
        .bindPopup(popupHtml);

    return marker;
}

// Function to find the best position for disaster markers relative to route
function getOptimalDisasterPosition(disasterLat, disasterLon, routeBounds) {
    if (!routeBounds) return [disasterLat, disasterLon];
    
    // Check if we need to adjust longitude for better positioning
    const routeCenter = routeBounds.getCenter();
    const routeWest = routeBounds.getWest();
    const routeEast = routeBounds.getEast();
    
    let adjustedLon = disasterLon;
    
    // If route spans across date line (west > east), handle specially
    if (routeWest > routeEast) {
        // Route crosses date line
        if (disasterLon < 0 && routeCenter.lng > 0) {
            adjustedLon = disasterLon + 360;
        } else if (disasterLon > 0 && routeCenter.lng < 0) {
            adjustedLon = disasterLon - 360;
        }
    } else {
        // Normal case - find closest representation
        const dist1 = Math.abs(disasterLon - routeCenter.lng);
        const dist2 = Math.abs(disasterLon + 360 - routeCenter.lng);
        const dist3 = Math.abs(disasterLon - 360 - routeCenter.lng);
        
        if (dist2 < dist1 && dist2 < dist3) {
            adjustedLon = disasterLon + 360;
        } else if (dist3 < dist1 && dist3 < dist2) {
            adjustedLon = disasterLon - 360;
        }
    }
    
    return [disasterLat, adjustedLon];
}

// Function to add disaster markers and bounding boxes
function addDisasterMarkers(disasters, routeBounds = null) {
    disasters.forEach(disaster => {
        // Get optimal position for the disaster marker
        const [adjustedLat, adjustedLon] = getOptimalDisasterPosition(
            disaster.lat, disaster.lon, routeBounds
        );
        
        // Create disaster marker with adjusted coordinates
        const adjustedDisaster = {...disaster, lat: adjustedLat, lon: adjustedLon};
        const marker = createDisasterMarker(adjustedDisaster);
        if (layerVisibility.disasters) {
            marker.addTo(map);
        }
        disasterMarkers.push(marker);
        
        // Add bounding box if available
        if (disaster.bbox && disaster.bbox.lat_min && disaster.bbox.lon_min && 
            disaster.bbox.lat_max && disaster.bbox.lon_max) {
            
            const alertLevel = disaster.alert_level || 'Unknown';
            const alertColor = alertColorMap[alertLevel] || alertColorMap['Unknown'];
            
            // Adjust bbox coordinates as well
            const [adjLatMin, adjLonMin] = getOptimalDisasterPosition(
                disaster.bbox.lat_min, disaster.bbox.lon_min, routeBounds
            );
            const [adjLatMax, adjLonMax] = getOptimalDisasterPosition(
                disaster.bbox.lat_max, disaster.bbox.lon_max, routeBounds
            );
            
            const bboxCoords = [
                [adjLatMin, adjLonMin],
                [adjLatMin, adjLonMax],
                [adjLatMax, adjLonMax],
                [adjLatMax, adjLonMin]
            ];
            
            const bboxPolygon = L.polygon(bboxCoords, {
                color: alertColor,
                weight: 2,
                fillColor: alertColor,
                fillOpacity: 0.2,
                dashArray: '5, 5'
            });
            
            if (layerVisibility.disasters) {
                bboxPolygon.addTo(map);
            }
            disasterMarkers.push(bboxPolygon);
            
            // Add popup to bbox as well
            bboxPolygon.bindPopup(`
                <div style="text-align: center;">
                    <strong>Disaster Area: ${disaster.title}</strong><br>
                    Alert Level: ${disaster.alert_level || 'Unknown'}<br>
                    Type: ${disaster.event_type}
                </div>
            `);
        }
    });
}

// Function to add ship markers (FOR DISASTER AREA SHIPS - KEEP)
function addShipMarkers(shipsData, routeBounds = null) {
    if (!shipsData) return;
    
    let totalShips = 0;
    
    // Process ships data organized by disaster GDACS ID
    Object.keys(shipsData).forEach(gdacsId => {
        const disasterShips = shipsData[gdacsId];
        if (disasterShips && disasterShips.ships) {
            disasterShips.ships.forEach(ship => {
                if (ship.point && ship.point.latitude && ship.point.longitude) {
                    // Use original coordinates, don't adjust for route bounds
                    const lat = ship.point.latitude;
                    const lon = ship.point.longitude;
                    
                    const marker = createShipMarker(ship);
                    if (layerVisibility.congestion) {
                        marker.addTo(map);
                    }
                    shipMarkers.push(marker);
                    totalShips++;
                }
            });
        }
    });
    
    // Update ship alerts in sidebar
    const shipAlerts = document.getElementById('ship-alerts');
    if (totalShips > 0) {
        shipAlerts.innerHTML = `
            <div style="margin-top: 15px; padding: 10px; border-radius: 5px; background-color: #e3f2fd; border-left: 5px solid #2196F3; color: #1565C0;">
                <strong>Ships Tracked:</strong> ${totalShips} vessel(s) detected in disaster areas
            </div>
        `;
    } else {
        shipAlerts.innerHTML = `
            <div style="margin-top: 15px; padding: 10px; border-radius: 5px; background-color: #fff3cd; border-left: 5px solid #ffc107; color: #856404;">
                <strong>No Ships Found:</strong> No vessels detected in disaster areas
            </div>
        `;
    }
}

// Function to display congestion alerts
function displayCongestionAlerts(originData, destData) {
    const congestionAlerts = document.getElementById('congestion-alerts');
    congestionAlerts.innerHTML = '';
    
    if (originData.congestion && originData.congestion.congested) {
        const alert = document.createElement('div');
        alert.className = 'alert-box';
        alert.style.backgroundColor = '#fff3cd';
        alert.style.borderLeftColor = '#ffc107';
        alert.innerHTML = `<strong>Port Congestion!</strong> ${originData.name} has ${originData.congestion.ship_count} ships within ${originData.congestion.radius_km}km`;
        congestionAlerts.appendChild(alert);
    }
    
    if (destData.congestion && destData.congestion.congested) {
        const alert = document.createElement('div');
        alert.className = 'alert-box';
        alert.style.backgroundColor = '#fff3cd';
        alert.style.borderLeftColor = '#ffc107';
        alert.innerHTML = `<strong>Port Congestion!</strong> ${destData.name} has ${destData.congestion.ship_count} ships within ${destData.congestion.radius_km}km`;
        congestionAlerts.appendChild(alert);
    }
}

// Function to add ECA/MPA areas to map
function addEcaMpaAreas(ecaMpaData) {
    if (!ecaMpaData || !ecaMpaData.features || ecaMpaData.features.length === 0) {
        return;
    }
    
    console.log(`Adding ${ecaMpaData.features.length} ECA/MPA areas`);
    
    // Create GeoJSON layer
    const ecaMpaLayer = L.geoJSON(ecaMpaData, {
        style: function(feature) {
            if (feature.properties.type === 'ECA') {
                return {
                    fillColor: '#FFFF00',
                    fillOpacity: 0.3,
                    color: '#FFD700',
                    weight: 2,
                    opacity: 0.7
                };
            } else if (feature.properties.type === 'MPA') {
                return {
                    fillColor: '#FFA500', 
                    fillOpacity: 0.3,
                    color: '#FF8C00',
                    weight: 2,
                    opacity: 0.7
                };
            } else {
                return {
                    fillColor: '#FFFF00',
                    fillOpacity: 0.2,
                    color: '#FFD700', 
                    weight: 1,
                    opacity: 0.5
                };
            }
        },
        onEachFeature: function(feature, layer) {
        if (feature.properties && feature.properties.name) {
            // Clean up the name
            const rawName = feature.properties.name;
            const cleanName = rawName.replace(/_/g, ' ').trim();
            
            let popupContent = `<strong>${feature.properties.type} Area</strong><br>`;
            popupContent += `Name: ${cleanName}<br>`;  // Use cleaned name
            
            if (feature.properties.description) {
                popupContent += `Description: ${feature.properties.description}`;
            }
            
            layer.bindPopup(popupContent);
        }
    }
    });

    if (layerVisibility.protected) {
        ecaMpaLayer.addTo(map);
    }
    
    // Store reference to remove later
    window.ecaMpaLayer = ecaMpaLayer;
}

function addCollisionLines(collisionsData) {
    console.log("🎨 DRAWING COLLISION LINES:", collisionsData);
    
    // Remove existing collision lines
    if (window.collisionLines) {
        window.collisionLines.forEach(line => {
            if (map.hasLayer(line)) {
                map.removeLayer(line);
            }
        });
    }
    window.collisionLines = [];

    if (!collisionsData || collisionsData.length === 0) return;

    // ✅ ONLY SHOW CRITICAL COLLISIONS
    const criticalCollisions = collisionsData.filter(collision => 
        collision.risk_level === 'CRITICAL'
    );
    
    console.log(`🎯 Showing ${criticalCollisions.length} CRITICAL collisions (filtered from ${collisionsData.length})`);

    criticalCollisions.forEach((collision, index) => {
        const vesselA = collision.vessel_a;
        const vesselB = collision.vessel_b;
        
        // Create line between vessels - RED for CRITICAL
        const collisionLine = L.polyline([
            [vesselA.lat, vesselA.lon],
            [vesselB.lat, vesselB.lon]
        ], {
            color: '#ff0000',
            weight: 4,
            opacity: 0.9,
            dashArray: '5, 5'
        });

        const popupContent = `
            <div style="font-family: Arial, sans-serif; min-width: 250px;">
                <div style="background: #ff0000; color: white; padding: 12px; border-radius: 8px 8px 0 0; margin: -10px -10px 15px -10px;">
                    <h3 style="margin: 0; font-size: 16px; font-weight: 600;">🚨 Collision Alert</h3>
                </div>
                
                <div style="margin-bottom: 12px;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 8px;">
                        <div>
                            <div style="font-weight: 600; color: #4a5568; font-size: 12px;">Vessel A</div>
                            <div style="color: #2d3748; font-size: 13px;"><strong>${vesselA.name}</strong></div>
                            <div style="color: #666; font-size: 11px;">MMSI: ${vesselA.mmsi}</div>
                        </div>
                        <div>
                            <div style="font-weight: 600; color: #4a5568; font-size: 12px;">Vessel B</div>
                            <div style="color: #2d3748; font-size: 13px;"><strong>${vesselB.name}</strong></div>
                            <div style="color: #666; font-size: 11px;">MMSI: ${vesselB.mmsi}</div>
                        </div>
                    </div>
                </div>
                
                <div style="background: #f8f9fa; padding: 10px; border-radius: 6px; margin-bottom: 10px;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <div>
                            <div style="font-weight: 600; color: #4a5568; font-size: 12px;">CPA Distance</div>
                            <div style="color: #2d3748; font-size: 14px; font-weight: 600;">${collision.cpa_km.toFixed(3)} km</div>
                            <div style="color: #666; font-size: 11px;">${(collision.cpa_km / 1.852).toFixed(3)} NM</div>
                        </div>
                        <div>
                            <div style="font-weight: 600; color: #4a5568; font-size: 12px;">TCPA</div>
                            <div style="color: #2d3748; font-size: 14px; font-weight: 600;">${collision.tcpa_minutes.toFixed(1)} min</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        collisionLine.bindPopup(popupContent);
        collisionLine.addTo(map);
        window.collisionLines.push(collisionLine);
    });
    
    console.log(`✅ Added ${criticalCollisions.length} CRITICAL collision lines`);
}

// Debug function to check collision data
function debugCollisionData(shipsData) {
    console.log("🔍 === COLLISION DEBUG START ===");
    console.log("📦 Ships data structure:", shipsData);
    
    if (!shipsData) {
        console.log("❌ No ships data available");
        return;
    }
    
    const disasterCount = Object.keys(shipsData).length;
    console.log(`📊 Found ${disasterCount} disaster areas with ships`);
    
    Object.keys(shipsData).forEach(disasterId => {
        console.log(`\n🌪️ Disaster: ${disasterId}`);
        const disasterData = shipsData[disasterId];
        
        if (!disasterData) {
            console.log("❌ No disaster data");
            return;
        }
        
        console.log("📋 Disaster info:", disasterData.disaster_info);
        
        if (disasterData.ships && disasterData.ships.length > 0) {
            console.log(`🚢 Found ${disasterData.ships.length} ships in this disaster area`);
            
            disasterData.ships.forEach((ship, index) => {
                const hasCoords = ship.point && ship.point.latitude && ship.point.longitude;
                const hasSpeed = ship.speedKmh !== undefined && ship.speedKmh !== null;
                const hasBearing = ship.bearingDeg !== undefined && ship.bearingDeg !== null;
                
                console.log(`   Ship ${index}:`, {
                    name: ship.boatName || 'Unknown',
                    mmsi: ship.mmsi || 'Unknown',
                    lat: ship.point?.latitude,
                    lon: ship.point?.longitude,
                    speed: ship.speedKmh,
                    bearing: ship.bearingDeg,
                    hasValidData: hasCoords && hasSpeed && hasBearing,
                    vesselType: ship.vesselType
                });
            });
        } else {
            console.log("❌ No ships found in this disaster area");
        }
    });
    
    console.log("🔍 === COLLISION DEBUG END ===\n");
}

function checkAllDisasterCollisions(shipsData) {
    console.log("🚨 === COLLISION DETECTION STARTED ===");
    
    if (!shipsData) {
        console.log("❌ No ships data available for collision detection");
        return;
    }
    
    // Debug the ships data first
    debugCollisionData(shipsData);
    
    const disasterIds = Object.keys(shipsData);
    console.log(`🔍 Checking collisions for ${disasterIds.length} disaster areas:`, disasterIds);
    
    // Collect all collisions from all disaster areas
    let allCollisions = [];
    let processedDisasters = 0;
    const totalDisasters = disasterIds.length;
    
    if (totalDisasters === 0) {
        console.log("❌ No disaster areas with ships to check");
        return;
    }
    
    disasterIds.forEach(disasterId => {
        console.log(`\n📡 Fetching collisions for disaster: ${disasterId}`);
        
        fetch(`/api/collisions/${disasterId}`)
            .then(response => {
                console.log(`📊 API Response status for ${disasterId}: ${response.status}`);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(collisions => {
                console.log(`✅ Collisions API response for ${disasterId}:`, collisions);
                
                if (collisions && Array.isArray(collisions) && collisions.length > 0) {
                    console.log(`🎯 Found ${collisions.length} collisions in ${disasterId}`);
                    allCollisions = allCollisions.concat(collisions);
                } else {
                    console.log(`➖ No collisions found for ${disasterId}`);
                }
                
                processedDisasters++;
                console.log(`📈 Progress: ${processedDisasters}/${totalDisasters} disaster areas processed`);
                
                // When all disasters are processed, draw collisions
                if (processedDisasters === totalDisasters) {
                    console.log(`\n🎉 ALL DISASTERS PROCESSED!`);
                    console.log(`📊 Total collisions found: ${allCollisions.length}`);
                    console.log("📋 Collisions data:", allCollisions);
                    
                    if (allCollisions.length > 0) {
                        console.log("🎨 Drawing collision lines...");
                        addCollisionLines(allCollisions);
                        
                        // Add collision alert as dropdown to sidebar
                        const disasterAlerts = document.getElementById('disaster-alerts');
                        const alert = document.createElement('div');
                        alert.className = 'alert-box';
                        alert.style.backgroundColor = '#fff3cd';
                        alert.style.borderLeftColor = '#ff9900';
                        alert.style.color = '#856404';
                        alert.style.cursor = 'pointer';
                        alert.style.position = 'relative';

                        // Alert header (clickable)
                        const alertHeader = document.createElement('div');
                        alertHeader.onclick = function() { toggleCollisionDropdown(); };
                        alertHeader.style.cssText = `
                            display: flex;
                            justify-content: space-between;
                            align-items: flex-start;
                            padding-right: 5px;
                            gap: 10px;
                        `;
                        alertHeader.innerHTML = `
                            <div style="flex: 1;">
                                <strong>🚨 Collision Alert!</strong> ${allCollisions.length} potential collision(s) detected in disaster areas
                            </div>
                            <i id="collision-dropdown-icon" class="fas fa-chevron-down" style="font-size: 14px; flex-shrink: 0; margin-left: 10px;"></i>
                        `;

                        // Dropdown content (initially hidden)
                        const dropdownContent = document.createElement('div');
                        dropdownContent.id = 'collision-dropdown-content';
                        dropdownContent.style.display = 'none';
                        dropdownContent.style.marginTop = '15px';
                        dropdownContent.style.paddingTop = '15px';
                        dropdownContent.style.borderTop = '1px solid rgba(133, 100, 4, 0.3)';

                        let html = '';
                        allCollisions.forEach((collision, index) => {
                            const vesselA = collision.vessel_a;
                            const vesselB = collision.vessel_b;
                            
                            html += `
                                <div onclick="event.stopPropagation(); goToCollision(${index})" style="background: linear-gradient(135deg, #ff1744 0%, #f50057 100%); 
                                    border: 2px solid #ff5252; padding: 12px; margin-bottom: 12px; border-radius: 8px; 
                                    cursor: pointer; transition: all 0.2s ease; box-shadow: 0 2px 8px rgba(255, 23, 68, 0.3);">
                                    
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                        <div style="font-weight: 700; color: #ffffff; font-size: 15px; text-shadow: 0 1px 2px rgba(0,0,0,0.3);">
                                            <i class="fas fa-exclamation-triangle"></i> Collision ${index + 1}
                                        </div>
                                        <div style="background: #ffffff; color: #ff1744; padding: 4px 12px; border-radius: 20px; 
                                            font-size: 11px; font-weight: 800; letter-spacing: 0.5px; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
                                            CRITICAL
                                        </div>
                                    </div>
                                    
                                    <div style="font-size: 13px; color: #ffffff; line-height: 1.6; font-weight: 500;">
                                        <div style="margin-bottom: 6px; padding: 8px; background: rgba(255, 255, 255, 0.15); 
                                            border-radius: 6px; backdrop-filter: blur(10px);">
                                            <strong style="color: #ffeb3b;">Vessel A:</strong> ${vesselA.name}
                                        </div>
                                        <div style="margin-bottom: 8px; padding: 8px; background: rgba(255, 255, 255, 0.15); 
                                            border-radius: 6px; backdrop-filter: blur(10px);">
                                            <strong style="color: #ffeb3b;">Vessel B:</strong> ${vesselB.name}
                                        </div>
                                        
                                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; 
                                            padding: 10px; background: rgba(0, 0, 0, 0.2); border-radius: 6px;">
                                            <div>
                                                <div style="font-size: 11px; color: #ffeb3b; font-weight: 600; margin-bottom: 4px;">
                                                    CPA DISTANCE
                                                </div>
                                                <div style="font-weight: 700; font-size: 16px; color: #ffffff;">
                                                    ${collision.cpa_km.toFixed(3)} km
                                                </div>
                                            </div>
                                            <div>
                                                <div style="font-size: 11px; color: #ffeb3b; font-weight: 600; margin-bottom: 4px;">
                                                    TIME TO CPA
                                                </div>
                                                <div style="font-weight: 700; font-size: 16px; color: #ffffff;">
                                                    ${collision.tcpa_minutes.toFixed(1)} min
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div style="margin-top: 10px; text-align: center; color: #ffeb3b; font-size: 12px; 
                                        font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">
                                        <i class="fas fa-map-marker-alt"></i> Click to view on map
                                    </div>
                                </div>
                            `;
                        });

                        dropdownContent.innerHTML = html;

                        alert.appendChild(alertHeader);
                        alert.appendChild(dropdownContent);
                        disasterAlerts.appendChild(alert);

                        // Store collisions globally for navigation
                        window.currentRouteCollisions = allCollisions;
                        
                        console.log("✅ Collision alert dropdown added to sidebar");
                    } else {
                        console.log("➖ No collisions to display");
                    }
                }
            })
            .catch(error => {
                console.error(`❌ Error fetching collisions for ${disasterId}:`, error);
                processedDisasters++;
                console.log(`📈 Progress: ${processedDisasters}/${totalDisasters} disaster areas processed (with error)`);
                
                // Continue processing even if one fails
                if (processedDisasters === totalDisasters) {
                    if (allCollisions.length > 0) {
                        addCollisionLines(allCollisions);
                    }
                }
            });
    });
    
    console.log("🚨 === COLLISION DETECTION INITIATED ===");
}

// Function to toggle collision dropdown
function toggleCollisionDropdown() {
    const content = document.getElementById('collision-dropdown-content');
    const icon = document.getElementById('collision-dropdown-icon');
    
    if (content && icon) {
        if (content.style.display === 'none') {
            content.style.display = 'block';
            icon.className = 'fas fa-chevron-up';
        } else {
            content.style.display = 'none';
            icon.className = 'fas fa-chevron-down';
        }
    }
}

// Function to navigate to collision on map (for route collisions)
function goToCollision(index) {
    if (window.currentRouteCollisions && index >= 0 && index < window.currentRouteCollisions.length) {
        const collision = window.currentRouteCollisions[index];
        const vesselA = collision.vessel_a;
        const vesselB = collision.vessel_b;
        
        const centerLat = (vesselA.lat + vesselB.lat) / 2;
        const centerLon = (vesselA.lon + vesselB.lon) / 2;
        
        map.setView([centerLat, centerLon], 10);
        
        // Open the collision line popup if available
        if (window.collisionLines && window.collisionLines[index]) {
            window.collisionLines[index].openPopup();
        }
    }
}

// Helper function to calculate distance between points
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Function to add congested port ships to map
function addCongestedPortShips(originData, destData) {
    // Add origin port ships (show even if not congested)
    if (originData.congestion && originData.congestion.ships && originData.congestion.ships.length > 0) {
        console.log(`Adding ${originData.congestion.ships.length} ships from origin port: ${originData.name}`);
        originData.congestion.ships.forEach(ship => {
            if (ship.point && ship.point.latitude && ship.point.longitude) {
                // Use red for congested, blue for normal
                const iconColor = originData.congestion.congested ? '#FF0000' : '#2196F3';
                const portIcon = L.divIcon({
                    className: 'ship-marker-simple port-ship',
                    html: `<i class="fas fa-anchor" style="font-size: 16px; color: ${iconColor};"></i>`,
                    iconSize: [24, 24],
                    iconAnchor: [12, 12],
                    popupAnchor: [0, -12]
                });
                
                const marker = L.marker([ship.point.latitude, ship.point.longitude], {icon: portIcon})
                    .bindPopup(createShipMarker(ship).getPopup());
                if (layerVisibility.congestion) {
                    marker.addTo(map);
                    }
                shipMarkers.push(marker);
            }
        });
    }
    
    // Add destination port ships (show even if not congested)
    if (destData.congestion && destData.congestion.ships && destData.congestion.ships.length > 0) {
        console.log(`Adding ${destData.congestion.ships.length} ships from destination port: ${destData.name}`);
        destData.congestion.ships.forEach(ship => {
            if (ship.point && ship.point.latitude && ship.point.longitude) {
                // Use red for congested, blue for normal
                const iconColor = destData.congestion.congested ? '#FF0000' : '#2196F3';
                const portIcon = L.divIcon({
                    className: 'ship-marker-simple port-ship',
                    html: `<i class="fas fa-anchor" style="font-size: 16px; color: ${iconColor};"></i>`,
                    iconSize: [24, 24],
                    iconAnchor: [12, 12],
                    popupAnchor: [0, -12]
                });
                
                const marker = L.marker([ship.point.latitude, ship.point.longitude], {icon: portIcon})
                    .bindPopup(createShipMarker(ship).getPopup());
                if (layerVisibility.congestion) {
                    marker.addTo(map);
                }
                shipMarkers.push(marker);
            }
        });
    }
}

function showChokepoints() {
    // Clear old chokepoint markers and circles ONLY
    chokepointMarkers.forEach(m => map.removeLayer(m));
    chokepointMarkers = [];
    
    // Clear old chokepoint ships ONLY (not disaster ships)
    if (chokepointShipMarkers) {
        chokepointShipMarkers.forEach(m => map.removeLayer(m));
        chokepointShipMarkers = [];
    }

    // Update button to show loading
    const btn = document.getElementById('view-chokepoints-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
    btn.disabled = true;

    // Fetch ships for all chokepoints
    fetch('/api/chokepoint_ships', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ chokepoints: window.currentChokepoints })
    })
    .then(res => res.json())
    .then(data => {
        console.log('All chokepoint ships response:', data);
        
        const allShips = data.ships || {};
        
        // Now display chokepoints with ships
        window.currentChokepoints.forEach(cp => {
            // Create simple bright red circle icon
            const icon = L.divIcon({
                className: 'chokepoint-icon',
                html: `<div style="background: #ff0000; width: 16px; height: 16px; border-radius: 50%; 
                              border: 2px solid #ffffff; box-shadow: 0 0 10px rgba(255, 0, 0, 0.8);"></div>`,
                iconSize: [16, 16],
                iconAnchor: [8, 8],
                popupAnchor: [0, -8]
            });

            const marker = L.marker([cp.lat, cp.lon], { icon })
                .addTo(map);

            // Add LARGE red circle (50km radius for visibility)
            const circle = L.circle([cp.lat, cp.lon], {
                radius: 80000, // 50km in meters
                color: '#ff0000',
                fillColor: '#ff0000',
                fillOpacity: 0.2,
                weight: 3,
                opacity: 0.8
            }).addTo(map);
            
            chokepointMarkers.push(circle);
            
            // Get ships for this chokepoint
            const ships = allShips[cp.name] || [];
            
            // Set popup with ship count
            marker.bindPopup(`
                <div style="font-family: Arial, sans-serif; min-width: 200px;">
                    <div style="background: linear-gradient(135deg, #ff0000 0%, #cc0000 100%); 
                               color: white; padding: 12px; border-radius: 8px 8px 0 0; 
                               margin: -10px -10px 15px -10px;">
                        <h3 style="margin: 0; font-size: 16px; font-weight: 600;">
                            <i class="fas fa-dharmachakra"></i> ${cp.name}
                        </h3>
                    </div>
                    <div style="padding: 5px 0;">
                        <strong style="color: #ff0000;">${ships.length} ships</strong> in chokepoint area (50km radius)
                    </div>
                </div>
            `);
            
            // Add click event to zoom into chokepoint
            marker.on('click', function() {
                map.setView([cp.lat, cp.lon], 8); // Zoom level 8 shows ~50km radius well
            });

            // Also add click to circle
            circle.on('click', function() {
                map.setView([cp.lat, cp.lon], 8);
                marker.openPopup(); // Open the marker popup when clicking circle
            });
            
            // Add all ships to map using separate array
            if (ships.length > 0) {
                console.log(`Adding ${ships.length} ships for ${cp.name}`);
                ships.forEach(ship => {
                    if (ship.point && ship.point.latitude && ship.point.longitude) {
                        const shipMarker = createShipMarker(ship);
                        if (layerVisibility.congestion) {
                            shipMarker.addTo(map);
                        }
                        chokepointShipMarkers.push(shipMarker);  // Use separate array
                    }
                });
            } else {
                console.log(`No ships found for ${cp.name}`);
            }

            chokepointMarkers.push(marker);
        });
        
        // Restore button
        btn.innerHTML = originalText;
        btn.disabled = false;
    })
    .catch(error => {
        console.error('Error fetching chokepoint ships:', error);
        // Restore button
        btn.innerHTML = originalText;
        btn.disabled = false;
    });
}

// Global weather loading function
function loadWeather(button, lat, lon) {
    const container = button.closest('[data-weather-container]');
    const weatherContent = container.querySelector('.weather-content');
    
    if (!weatherContent) return;
    
    if (weatherContent.style.display === 'none' || weatherContent.style.display === '') {
        weatherContent.innerHTML = '<div style="text-align: center; padding: 10px; color: #666;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
        weatherContent.style.display = 'block';
        
        fetch(`/api/weather?lat=${lat}&lon=${lon}`)
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    weatherContent.innerHTML = `<div style="color: #f44336; padding: 10px; text-align: center;">${data.error}</div>`;
                    return;
                }
                
                let html = `
                    <div style="margin-bottom: 10px; padding: 8px; background: #f0f7ff; border-radius: 6px;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                            <div>
                                <div style="font-weight: 600; color: #4a5568; font-size: 11px;">Current Temp</div>
                                <div style="color: #2d3748; font-size: 13px;">${data.current.temperature_2m}°C</div>
                            </div>
                            <div>
                                <div style="font-weight: 600; color: #4a5568; font-size: 11px;">Wind Speed</div>
                                <div style="color: #2d3748; font-size: 13px;">${data.current.wind_speed_10m} km/h</div>
                            </div>
                        </div>
                    </div>
                `;
                
                if (data.forecast && data.forecast.length > 0) {
                    html += '<div style="font-weight: 600; color: #4a5568; font-size: 12px; margin-bottom: 8px;">Next 5 Days:</div>';
                    data.forecast.forEach(day => {
                        html += `
                            <div style="display: grid; grid-template-columns: 80px 1fr 1fr; gap: 8px; align-items: center; padding: 6px 0; border-bottom: 1px solid #e2e8f0;">
                                <div style="font-weight: 500; color: #2d3748; font-size: 12px;">${day.day_name}</div>
                                <div>
                                    <div style="font-size: 11px; color: #666;">Temp</div>
                                    <div style="font-size: 12px; color: #2d3748;">${day.avg_temp}°C</div>
                                </div>
                                <div>
                                    <div style="font-size: 11px; color: #666;">Wind</div>
                                    <div style="font-size: 12px; color: #2d3748;">${day.avg_wind} km/h</div>
                                </div>
                            </div>
                        `;
                    });
                }
                
                weatherContent.innerHTML = html;
            })
            .catch(error => {
                weatherContent.innerHTML = `<div style="color: #f44336; padding: 10px; text-align: center;">Failed to load weather</div>`;
            });
    } else {
        weatherContent.style.display = 'none';
    }
}

function createWeatherSection(lat, lon) {
    const container = document.createElement('div');
    container.innerHTML = `
        <div style="margin-top: 15px; padding-top: 12px; border-top: 1px solid #e2e8f0;" data-weather-container>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div style="font-weight: 600; color: #4a5568; font-size: 14px;">
                    <i class="fas fa-cloud-sun" style="margin-right: 6px; color: #4facfe;"></i>
                    Weather Forecast
                </div>
                <button class="show-weather-btn" onclick="event.preventDefault(); event.stopPropagation(); loadWeather(this, ${lat}, ${lon})"
                        style="background: #4facfe; color: white; border: none; padding: 4px 12px; border-radius: 4px; font-size: 12px; cursor: pointer;"
                        data-lat="${lat}" data-lon="${lon}">
                    Load Forecast
                </button>
            </div>
            <div class="weather-content" style="display: none;"></div>
        </div>
    `;
    
    // Add click event with proper event handling for Leaflet popups
        const btn = container.querySelector('.show-weather-btn');
        const weatherContent = container.querySelector('.weather-content');

btn.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    
    if (weatherContent.style.display === 'none' || weatherContent.style.display === '') {
        weatherContent.innerHTML = '<div style="text-align: center; padding: 10px; color: #666;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
        weatherContent.style.display = 'block';
        
        fetch(`/api/weather?lat=${lat}&lon=${lon}`)
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    weatherContent.innerHTML = `<div style="color: #f44336; padding: 10px; text-align: center;">${data.error}</div>`;
                    return;
                }
                
                let html = `
                    <div style="margin-bottom: 10px; padding: 8px; background: #f0f7ff; border-radius: 6px;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                            <div>
                                <div style="font-weight: 600; color: #4a5568; font-size: 11px;">Current Temp</div>
                                <div style="color: #2d3748; font-size: 13px;">${data.current.temperature_2m}°C</div>
                            </div>
                            <div>
                                <div style="font-weight: 600; color: #4a5568; font-size: 11px;">Wind Speed</div>
                                <div style="color: #2d3748; font-size: 13px;">${data.current.wind_speed_10m} km/h</div>
                            </div>
                        </div>
                    </div>
                `;
                
                if (data.forecast && data.forecast.length > 0) {
                    html += '<div style="font-weight: 600; color: #4a5568; font-size: 12px; margin-bottom: 8px;">Next 5 Days:</div>';
                    data.forecast.forEach(day => {
                        html += `
                            <div style="display: grid; grid-template-columns: 80px 1fr 1fr; gap: 8px; align-items: center; padding: 6px 0; border-bottom: 1px solid #e2e8f0;">
                                <div style="font-weight: 500; color: #2d3748; font-size: 12px;">${day.day_name}</div>
                                <div>
                                    <div style="font-size: 11px; color: #666;">Temp</div>
                                    <div style="font-size: 12px; color: #2d3748;">${day.avg_temp}°C</div>
                                </div>
                                <div>
                                    <div style="font-size: 11px; color: #666;">Wind</div>
                                    <div style="font-size: 12px; color: #2d3748;">${day.avg_wind} km/h</div>
                                </div>
                            </div>
                        `;
                    });
                }
                
                weatherContent.innerHTML = html;
            })
            .catch(error => {
                weatherContent.innerHTML = `<div style="color: #f44336; padding: 10px; text-align: center;">Failed to load weather</div>`;
            });
    } else {
        weatherContent.style.display = 'none';
    }
});

return container;
}

// Function to create piracy incident marker
function createPiracyMarker(incident) {
    const piracyIcon = L.divIcon({
        className: 'piracy-icon',
        html: `<i class="fas fa-skull-crossbones" style="color: #8B0000; font-size: 18px; text-shadow: 2px 2px 4px rgba(0,0,0,0.5);"></i>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -15]
    });
    
    const popupHtml = `
        <div style="font-family: Arial, sans-serif; min-width: 300px; max-width: 350px;">
            <div style="background: linear-gradient(135deg, #8B0000 0%, #B22222 100%); color: white; padding: 12px; border-radius: 8px 8px 0 0; margin: -10px -10px 15px -10px;">
                <h3 style="margin: 0; font-size: 16px; font-weight: 600;">
                    <i class="fas fa-skull-crossbones"></i> Piracy Incident
                </h3>
            </div>
            
            <div style="display: grid; grid-template-columns: 30px 1fr; gap: 10px; align-items: center; margin-bottom: 8px;">
                <div style="background: #ffe6e6; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
                    <span style="font-size: 16px; color: #8B0000;">📅</span>
                </div>
                <div>
                    <div style="font-weight: 600; color: #4a5568; font-size: 13px;">Date of Incident</div>
                    <div style="color: #2d3748; font-size: 14px;">${incident.date}</div>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 30px 1fr; gap: 10px; align-items: center; margin-bottom: 8px;">
                <div style="background: #ffe6e6; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
                    <span style="font-size: 16px; color: #8B0000;">🔢</span>
                </div>
                <div>
                    <div style="font-weight: 600; color: #4a5568; font-size: 13px;">Incident Number</div>
                    <div style="color: #2d3748; font-size: 14px;">${incident.incident_number || 'N/A'}</div>
                </div>
            </div>
            
            ${incident.location_desc ? `
            <div style="display: grid; grid-template-columns: 30px 1fr; gap: 10px; align-items: center; margin-bottom: 8px;">
                <div style="background: #ffe6e6; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
                    <span style="font-size: 16px; color: #8B0000;">📍</span>
                </div>
                <div>
                    <div style="font-weight: 600; color: #4a5568; font-size: 13px;">Location</div>
                    <div style="color: #2d3748; font-size: 14px;">${incident.location_desc}</div>
                </div>
            </div>
            ` : ''}
            
            ${incident.incident_type ? `
            <div style="display: grid; grid-template-columns: 30px 1fr; gap: 10px; align-items: center; margin-bottom: 8px;">
                <div style="background: #ffe6e6; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
                    <span style="font-size: 16px; color: #8B0000;">⚠️</span>
                </div>
                <div>
                    <div style="font-weight: 600; color: #4a5568; font-size: 13px;">Type</div>
                    <div style="color: #2d3748; font-size: 14px;">${incident.incident_type}</div>
                </div>
            </div>
            ` : ''}
            
                <div style="margin-top: 12px; padding: 12px; background: #fff5f5; border-radius: 6px; border-left: 3px solid #8B0000;">
                <div style="font-weight: 600; color: #8B0000; font-size: 13px; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-file-alt"></i> Situation Report
                </div>
                <div style="color: #2d3748; font-size: 13px; line-height: 1.5; white-space: pre-line; background: white; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 12px;">
                    ${incident.sitrep || 'No details available'}
                </div>
            </div>
            
            <div style="margin-top: 12px; font-size: 12px; color: #666; text-align: center;">
                <i>Coordinates: ${incident.lat?.toFixed(4) || 'N/A'}, ${incident.lon?.toFixed(4) || 'N/A'}</i>
            </div>
        </div>
    `;
    
    return L.marker([incident.lat, incident.lon], {icon: piracyIcon})
        .bindPopup(popupHtml);
}

// Function to add piracy markers
function addPiracyMarkers(piracyData, routeBounds = null) {
    if (!piracyData || !piracyData.incidents || piracyData.incidents.length === 0) {
        return;
    }
    
    console.log(`Adding ${piracyData.incidents.length} piracy incident markers`);
    
    piracyData.incidents.forEach(incident => {
        if (incident.lat && incident.lon) {
            const marker = createPiracyMarker(incident);
            marker.addTo(map);
            window.piracyMarkers = window.piracyMarkers || [];
            window.piracyMarkers.push(marker);
        }
    });
}

// Function to toggle layer visibility
function toggleLayerVisibility(layerType, visible) {
    layerVisibility[layerType] = visible;
    
    switch(layerType) {
        case 'disasters':
            disasterMarkers.forEach(marker => {
                if (visible) {
                    if (!map.hasLayer(marker)) marker.addTo(map);
                } else {
                    if (map.hasLayer(marker)) map.removeLayer(marker);
                }
            });
            break;
            
        case 'congestion':
            // Toggle disaster area ships
            shipMarkers.forEach(marker => {
                if (visible) {
                    if (!map.hasLayer(marker)) marker.addTo(map);
                } else {
                    if (map.hasLayer(marker)) map.removeLayer(marker);
                }
            });
            
            // Toggle chokepoint ships
            if (chokepointShipMarkers) {
                chokepointShipMarkers.forEach(marker => {
                    if (visible) {
                        if (!map.hasLayer(marker)) marker.addTo(map);
                    } else {
                        if (map.hasLayer(marker)) map.removeLayer(marker);
                    }
                });
            }
            break;
            
        case 'protected':
            if (window.ecaMpaLayer) {
                if (visible) {
                    if (!map.hasLayer(window.ecaMpaLayer)) window.ecaMpaLayer.addTo(map);
                } else {
                    if (map.hasLayer(window.ecaMpaLayer)) map.removeLayer(window.ecaMpaLayer);
                }
            }
            break;
    }
}

// Function to toggle legend
function toggleLegend() {
    const legend = document.querySelector('.legend');
    const button = document.getElementById('legend-toggle-btn');
    
    if (legend.style.display === 'none') {
        legend.style.display = 'block';
        button.innerHTML = '<i class="fas fa-layer-group"></i>';
        button.title = 'Hide Legend';
    } else {
        legend.style.display = 'none';
        button.innerHTML = '<i class="fas fa-eye"></i>';
        button.title = 'Show Legend';
    }
}

// Function to create port popup
function createPortPopup(portData, isOrigin = true) {
    const portType = isOrigin ? 'Origin' : 'Destination';
    
    return `
        <div style="font-family: Arial, sans-serif; min-width: 250px;">
            <div style="background: linear-gradient(135deg, ${isOrigin ? '#4CAF50' : '#F44336'} 0%, ${isOrigin ? '#2E7D32' : '#C62828'} 100%); 
                        color: white; padding: 12px; border-radius: 8px 8px 0 0; margin: -10px -10px 15px -10px;">
                <h3 style="margin: 0; font-size: 16px; font-weight: 600;">${portType} Port</h3>
            </div>
            
            <div style="display: grid; grid-template-columns: 30px 1fr; gap: 10px; align-items: center; margin-bottom: 8px;">
                <div style="background: #e3f2fd; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
                    <span style="font-size: 16px;">🏗️</span>
                </div>
                <div>
                    <div style="font-weight: 600; color: #4a5568; font-size: 13px;">Port Name</div>
                    <div style="color: #2d3748; font-size: 14px;">${portData.name || 'N/A'}</div>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 30px 1fr; gap: 10px; align-items: center; margin-bottom: 8px;">
                <div style="background: #e8f5e9; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
                    <span style="font-size: 16px;">🏷️</span>
                </div>
                <div>
                    <div style="font-weight: 600; color: #4a5568; font-size: 13px;">Port Code</div>
                    <div style="color: #2d3748; font-size: 14px;">${portData.code || 'N/A'}</div>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 30px 1fr; gap: 10px; align-items: center; margin-bottom: 8px;">
                <div style="background: #fff3e0; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
                    <span style="font-size: 16px;">📏</span>
                </div>
                <div>
                    <div style="font-weight: 600; color: #4a5568; font-size: 13px;">Harbor Size</div>
                    <div style="color: #2d3748; font-size: 14px;">${portData.harbor_size || 'N/A'}</div>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 30px 1fr; gap: 10px; align-items: center; margin-bottom: 8px;">
                <div style="background: #e8eaf6; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
                    <span style="font-size: 16px;">⚓</span>
                </div>
                <div>
                    <div style="font-weight: 600; color: #4a5568; font-size: 13px;">Harbor Type</div>
                    <div style="color: #2d3748; font-size: 14px;">${portData.harbor_type || 'N/A'}</div>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 30px 1fr; gap: 10px; align-items: center; margin-bottom: 15px;">
                <div style="background: #f3e5f5; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
                    <span style="font-size: 16px;">📍</span>
                </div>
                <div>
                    <div style="font-weight: 600; color: #4a5568; font-size: 13px;">Coordinates</div>
                    <div style="color: #2d3748; font-size: 14px;">${portData.lat?.toFixed(4) || 'N/A'}, ${portData.lon?.toFixed(4) || 'N/A'}</div>
                </div>
            </div>
            
            <!-- Detailed View Button -->
            <div style="margin-top: 15px; padding-top: 12px; border-top: 1px solid #e2e8f0;">
                <button onclick="window.open('/port_details?port_code=${portData.code}', '_blank')"
                        style="width: 100%; background: linear-gradient(135deg, #3498db 0%, #2980b9 100%); 
                               color: white; border: none; padding: 10px; border-radius: 6px; 
                               font-weight: 600; cursor: pointer; transition: all 0.3s ease;"
                        onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 5px 15px rgba(52, 152, 219, 0.4)';"
                        onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none';">
                    <i class="fas fa-external-link-alt"></i> See Detailed View
                </button>
            </div>
            
            ${createWeatherSection(portData.lat, portData.lon).outerHTML}
        </div>
    `;
}

// Initialize event listeners when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Legend toggle
    const legend = document.querySelector('.legend');
    const toggleButton = document.getElementById('legend-toggle-btn');
    
    // Ensure legend is initially visible
    if (!legend.style.display) {
        legend.style.display = 'block';
    }
    
    // Set initial button state
    if (legend.style.display === 'none') {
        toggleButton.innerHTML = '<i class="fas fa-eye"></i>';
        toggleButton.title = 'Show Legend';
    } else {
        toggleButton.innerHTML = '<i class="fas fa-layer-group"></i>';
        toggleButton.title = 'Hide Legend';
    }
    
    // Add click event listener to the button
    toggleButton.addEventListener('click', toggleLegend);
    
    // Add event listeners for toggle controls (REMOVED vessel tracking)
    document.getElementById('toggle-disasters').addEventListener('change', function() {
        toggleLayerVisibility('disasters', this.checked);
    });

    document.getElementById('toggle-congestion').addEventListener('change', function() {
        toggleLayerVisibility('congestion', this.checked);
    });

    document.getElementById('toggle-protected').addEventListener('change', function() {
        toggleLayerVisibility('protected', this.checked);
    });

    // REMOVED: document.getElementById('toggle-vessels').addEventListener('change', function() { ... });
});

// Calculate route button click
document.getElementById('calculate-route').addEventListener('click', function() {
    const originPort = document.getElementById('origin-port').value;
    const destPort = document.getElementById('dest-port').value;
    
    // Show loading
    document.getElementById('loading').style.display = 'block';
    document.getElementById('route-info').style.display = 'none';
    
    // Clear previous route and markers (but NOT vessel tracking - removed)
    clearMapLayers();
    
    // Calculate route
    fetch('/api/route', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            origin_port: originPort,
            dest_port: destPort
        })
    })
    .then(response => response.json())
    .then(data => {
        // Hide loading
        document.getElementById('loading').style.display = 'none';
        
        if (data.error) {
            alert('Error: ' + data.error);
            return;
        }
        
        if (data.enable_collision_check && data.ships) {
            checkAllDisasterCollisions(data.ships);
        }
        
        // Display route information
        document.getElementById('route-length').textContent = 
            `Route Length: ${data.route.length.toFixed(1)} ${data.route.units}`;
        
        // Display disaster alerts
        const disasterAlerts = document.getElementById('disaster-alerts');
        disasterAlerts.innerHTML = '';
        
        // Check origin disasters
        if (data.origin.disasters && data.origin.disasters.length > 0) {
            const alert = document.createElement('div');
            alert.className = 'alert-box';
            alert.innerHTML = `<strong>Warning!</strong> ${data.origin.disasters.length} disaster(s) near origin port`;
            disasterAlerts.appendChild(alert);
        }
        
        // Check destination disasters
        if (data.destination.disasters && data.destination.disasters.length > 0) {
            const alert = document.createElement('div');
            alert.className = 'alert-box';
            alert.innerHTML = `<strong>Warning!</strong> ${data.destination.disasters.length} disaster(s) near destination port`;
            disasterAlerts.appendChild(alert);
        }
        
        // Check route disasters
        if (data.route.disasters && data.route.disasters.length > 0) {
            const alert = document.createElement('div');
            alert.className = 'alert-box';
            alert.innerHTML = `<strong>Warning!</strong> ${data.route.disasters.length} disaster(s) along the route`;
            disasterAlerts.appendChild(alert);
        }
        
        // Show route info
        document.getElementById('route-info').style.display = 'block';
        // Show visibility controls
        document.getElementById('visibility-controls').style.display = 'block';
        // REMOVED: Show vessel controls
        // document.getElementById('vessel-controls').style.display = 'block';
        
                // Draw route on map if coordinates are available
        if (data.route.coordinates && data.route.coordinates.length > 0) {
            const routeCoords = data.route.coordinates;
            
            // Add origin and destination ports to the route coordinates
            const fullRouteCoords = [];
            
            // Add origin port as first point
            if (data.origin && data.origin.lat && data.origin.lon) {
                const [adjOriginLat, adjOriginLon] = getOptimalDisasterPosition(
                    data.origin.lat, data.origin.lon, window.currentRouteBounds
                );
                fullRouteCoords.push([adjOriginLat, adjOriginLon]);
            }
            
            // Add all route coordinates
            fullRouteCoords.push(...routeCoords);
            
            // Add destination port as last point
            if (data.destination && data.destination.lat && data.destination.lon) {
                const [adjDestLat, adjDestLon] = getOptimalDisasterPosition(
                    data.destination.lat, data.destination.lon, window.currentRouteBounds
                );
                fullRouteCoords.push([adjDestLat, adjDestLon]);
            }
            
            routeLayer = L.polyline(fullRouteCoords, {
                color: '#0066ff',
                weight: 4,
                opacity: 0.8,
                lineCap: 'round',
                lineJoin: 'round'
            }).addTo(map);
            
            // Fit map to show the entire route with ports
            map.fitBounds(routeLayer.getBounds(), {padding: [20, 20]});
            
            // Store route bounds for disaster positioning
            window.currentRouteBounds = routeLayer.getBounds();
        }
        
        // Add origin and destination markers with proper icons
        if (data.origin && data.origin.lat && data.origin.lon) {
            const [adjOriginLat, adjOriginLon] = getOptimalDisasterPosition(
                data.origin.lat, data.origin.lon, window.currentRouteBounds
            );
            
            const originIcon = L.icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
            });
            
            const originMarker = L.marker([adjOriginLat, adjOriginLon], {icon: originIcon})
                .addTo(map)
                .bindPopup(createPortPopup({
                    name: data.origin.name,
                    code: data.origin.port_code || data.origin.code,
                    harbor_size: data.origin.harbor_size,
                    harbor_type: data.origin.harbor_type,
                    lat: data.origin.lat,
                    lon: data.origin.lon
                }, true));
            
            portMarkers.push(originMarker);
        }
        
        if (data.destination && data.destination.lat && data.destination.lon) {
            const [adjDestLat, adjDestLon] = getOptimalDisasterPosition(
                data.destination.lat, data.destination.lon, window.currentRouteBounds
            );
            
            const destIcon = L.icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
            });
            
            const destMarker = L.marker([adjDestLat, adjDestLon], {icon: destIcon})
                .addTo(map)
                .bindPopup(createPortPopup({
                    name: data.destination.name,
                    code: data.destination.port_code || data.destination.code,
                    harbor_size: data.destination.harbor_size,
                    harbor_type: data.destination.harbor_type,
                    lat: data.destination.lat,
                    lon: data.destination.lon
                }, false));
            
            portMarkers.push(destMarker);
        }
        
        // Add all disaster markers with route bounds context
        if (data.origin && data.origin.disasters) {
            addDisasterMarkers(data.origin.disasters, window.currentRouteBounds);
        }
        if (data.destination && data.destination.disasters) {
            addDisasterMarkers(data.destination.disasters, window.currentRouteBounds);
        }
        if (data.route && data.route.disasters) {
            addDisasterMarkers(data.route.disasters, window.currentRouteBounds);
        }
        
        // Add ship markers if available (DISASTER AREA SHIPS - KEEP)
        if (data.ships) {
            addShipMarkers(data.ships, window.currentRouteBounds);
        }
        
        displayCongestionAlerts(data.origin, data.destination);
        addCongestedPortShips(data.origin, data.destination);
        
        if (data.eca_mpa_data) {
            addEcaMpaAreas(data.eca_mpa_data);

            // Add alert for ECA/MPA intersections
            const disasterAlerts = document.getElementById('disaster-alerts');
            const alert = document.createElement('div');
            alert.className = 'alert-box';
            alert.style.backgroundColor = '#fff3cd';
            alert.style.borderLeftColor = '#ffc107';
            alert.style.color = '#856404';
            alert.innerHTML = `<strong>ECA/MPA Alert!</strong> Route passes through regulated environmental areas`;
            disasterAlerts.appendChild(alert);
        }

        // Add piracy incidents if available
        if (data.piracy && data.piracy.incidents && data.piracy.incidents.length > 0) {
            addPiracyMarkers(data.piracy, window.currentRouteBounds);
            
            // Add piracy alert to sidebar
            const alert = document.createElement('div');
            alert.className = 'alert-box';
            alert.style.backgroundColor = '#fff5f5';
            alert.style.borderLeftColor = '#8B0000';
            alert.style.color = '#721c24';
            alert.innerHTML = `<strong><i class="fas fa-skull-crossbones"></i> Piracy Alert!</strong> ${data.piracy.incidents.length} incident(s) detected (last 5 months)`;
            disasterAlerts.appendChild(alert);
            
            // Add current month summary
            if (data.piracy.current_month_total > 0) {
                const summaryAlert = document.createElement('div');
                summaryAlert.className = 'alert-box';
                summaryAlert.style.backgroundColor = '#fff5f5';
                summaryAlert.style.borderLeftColor = '#8B0000';
                summaryAlert.style.color = '#721c24';
                summaryAlert.innerHTML = `<strong>Current Month Piracy:</strong> ${data.piracy.current_month_total} incident(s)`;
                disasterAlerts.appendChild(summaryAlert);
            }
        }
        // CHANGE TO:
        if (data.route && data.route.chokepoints && data.route.chokepoints.length > 0) {
            console.log(`Found ${data.route.chokepoints.length} chokepoints:`, data.route.chokepoints);
            document.getElementById('view-chokepoints-btn').style.display = 'block';
            window.currentChokepoints = data.route.chokepoints;
        } else {
            console.log('No chokepoints found in response');
            document.getElementById('view-chokepoints-btn').style.display = 'none';
        }
        
        // If no route coordinates but we have port coordinates, fit bounds to show both ports
        if ((!data.route.coordinates || data.route.coordinates.length === 0) && 
            data.origin && data.destination && data.origin.lat && data.origin.lon && 
            data.destination.lat && data.destination.lon) {
            
            const bounds = L.latLngBounds([
                [data.origin.lat, data.origin.lon],
                [data.destination.lat, data.destination.lon]
            ]);
            map.fitBounds(bounds, {padding: [50, 50]});
        }
    })
    .catch(error => {
        console.error('Error:', error);
        document.getElementById('loading').style.display = 'none';
        alert('Failed to calculate route: ' + error.message);
    });
});