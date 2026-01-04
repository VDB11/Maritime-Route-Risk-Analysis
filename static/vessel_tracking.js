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
    "Satellite": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Esri, Maxar, Earthstar Geographics',
            maxZoom: 19
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

// Global variables
let vesselMarkers = [];
let disasterMarkers = [];
let disasterShipMarkers = [];
let collisionLines = [];
let ecaMpaLayer = null;
let currentCollisions = [];
let currentBounds = null;
let drawingMode = false;
let drawnRectangle = null;
let customBounds = null;

// Visibility state
let layerVisibility = {
    ships: true,
    disasters: true,
    collisions: true,
    ecaMpa: true
};

// Alert color mapping
const alertColorMap = {
    'Red': '#ff4444',
    'Orange': '#ff8800', 
    'Green': '#44ff44',
    'Unknown': '#888888'
};

// Load ocean regions on page load
fetch('/api/ocean_regions')
    .then(response => response.json())
    .then(regions => {
        const select = document.getElementById('ocean-region');
        regions.forEach(region => {
            const option = document.createElement('option');
            option.value = region.name;
            option.textContent = region.name;
            select.appendChild(option);
        });
    })
    .catch(error => {
        console.error('Error loading ocean regions:', error);
    });

// Function to toggle layer visibility
function toggleLayerVisibility(layerType, visible) {
    layerVisibility[layerType] = visible;
    
    switch(layerType) {
        case 'ships':
            vesselMarkers.forEach(marker => {
                if (visible) {
                    if (!map.hasLayer(marker)) marker.addTo(map);
                } else {
                    if (map.hasLayer(marker)) map.removeLayer(marker);
                }
            });
            // Also toggle collisions with ships
            collisionLines.forEach(line => {
                if (visible) {
                    if (!map.hasLayer(line)) line.addTo(map);
                } else {
                    if (map.hasLayer(line)) map.removeLayer(line);
                }
            });
            break;
            
        case 'disasters':
            disasterMarkers.forEach(marker => {
                if (visible) {
                    if (!map.hasLayer(marker)) marker.addTo(map);
                } else {
                    if (map.hasLayer(marker)) map.removeLayer(marker);
                }
            });
            disasterShipMarkers.forEach(marker => {
                if (visible) {
                    if (!map.hasLayer(marker)) marker.addTo(map);
                } else {
                    if (map.hasLayer(marker)) map.removeLayer(marker);
                }
            });
            break;
            
        case 'ecaMpa':
            if (ecaMpaLayer) {
                if (visible) {
                    if (!map.hasLayer(ecaMpaLayer)) ecaMpaLayer.addTo(map);
                } else {
                    if (map.hasLayer(ecaMpaLayer)) map.removeLayer(ecaMpaLayer);
                }
            }
            break;
    }
}

// Helper function to darken a color for gradient
function darkenColor(color) {
    // Simple darkening for common colors
    if (color === '#2E7D32') return '#76C776'; // Darker light green
    if (color === '#2196F3') return '#1976D2'; // Darker blue
    if (color === '#FF9800') return '#F57C00'; // Darker orange
    return color; // Fallback
}

// Function to clear vessel markers
function clearVesselMarkers() {
    vesselMarkers.forEach(marker => {
        if (map.hasLayer(marker)) {
            map.removeLayer(marker);
        }
    });
    vesselMarkers = [];
}

// Function to clear disaster markers
function clearDisasterMarkers() {
    disasterMarkers.forEach(marker => {
        if (map.hasLayer(marker)) {
            map.removeLayer(marker);
        }
    });
    disasterMarkers = [];
    
    disasterShipMarkers.forEach(marker => {
        if (map.hasLayer(marker)) {
            map.removeLayer(marker);
        }
    });
    disasterShipMarkers = [];
}

// Function to clear collision lines
function clearCollisionLines() {
    collisionLines.forEach(line => {
        if (map.hasLayer(line)) {
            map.removeLayer(line);
        }
    });
    collisionLines = [];
    currentCollisions = [];
    
    // Hide collision list
    document.getElementById('collision-list-container').style.display = 'none';
}

// Function to clear ECA/MPA layer
function clearEcaMpaLayer() {
    if (ecaMpaLayer) {
        if (map.hasLayer(ecaMpaLayer)) {
            map.removeLayer(ecaMpaLayer);
        }
        ecaMpaLayer = null;
    }
}

function enableBboxDrawing() {
    // If already in drawing mode or bbox already drawn, clear and restart
    if (drawnRectangle) {
        map.removeLayer(drawnRectangle);
        drawnRectangle = null;
    }
    
    drawingMode = true;
    map.dragging.disable();
    map.getContainer().style.cursor = 'crosshair';
    document.getElementById('bbox-status').style.display = 'block';
    document.getElementById('bbox-status-text').textContent = 'Click and drag to draw area (Press ESC to cancel)';
    document.getElementById('ocean-region').disabled = true;
    
    let startLatLng = null;
    let mousemoveHandler = null;
    let mouseupHandler = null;
    
    // ESC key handler
    const escapeHandler = function(e) {
        if (e.key === 'Escape') {
            cancelDrawing();
        }
    };
    
    const cancelDrawing = function() {
        map.off('mousemove', mousemoveHandler);
        map.off('mouseup', mouseupHandler);
        map.dragging.enable();
        map.getContainer().style.cursor = '';
        drawingMode = false;
        
        if (drawnRectangle) {
            map.removeLayer(drawnRectangle);
            drawnRectangle = null;
        }
        
        customBounds = null;
        document.getElementById('bbox-status').style.display = 'none';
        document.getElementById('ocean-region').disabled = false;
        document.getElementById('draw-bbox-btn').innerHTML = '<i class="fas fa-draw-polygon"></i> Draw Custom Area';
        document.removeEventListener('keydown', escapeHandler);
    };
    
    document.addEventListener('keydown', escapeHandler);
    
    map.once('mousedown', function(e) {
        startLatLng = e.latlng;
        
        mousemoveHandler = function(e) {
            if (drawnRectangle) {
                map.removeLayer(drawnRectangle);
            }
            
            const bounds = L.latLngBounds(startLatLng, e.latlng);
            drawnRectangle = L.rectangle(bounds, {
                color: '#2E7D32',
                weight: 3,
                fillOpacity: 0.2
            }).addTo(map);
        };
        
        map.on('mousemove', mousemoveHandler);
        
        mouseupHandler = function(e) {
            map.off('mousemove', mousemoveHandler);
            map.dragging.enable();
            map.getContainer().style.cursor = '';
            drawingMode = false;
            
            const bounds = L.latLngBounds(startLatLng, e.latlng);
            customBounds = {
                sw_lat: bounds.getSouth(),
                sw_lon: bounds.getWest(),
                ne_lat: bounds.getNorth(),
                ne_lon: bounds.getEast()
            };
            
            document.getElementById('bbox-status-text').textContent = 'Custom area selected ✓';
            document.getElementById('draw-bbox-btn').innerHTML = '<i class="fas fa-redo"></i> Redraw Area';
            document.removeEventListener('keydown', escapeHandler);
        };
        
        map.once('mouseup', mouseupHandler);
    });
}

// Function to create ship marker
function createShipMarker(ship) {
    const vesselType = ship.vesselType || 'UNKNOWN';
    
    let formattedVesselType = vesselType;
    if (vesselType === 'CARGO_SHIP') {
        formattedVesselType = 'Cargo Ship';
    } else if (vesselType === 'TANKER') {
        formattedVesselType = 'Tanker';
    } else if (vesselType.includes('_')) {
        formattedVesselType = vesselType.toLowerCase()
            .replace(/_/g, ' ')
            .replace(/\b\w/g, char => char.toUpperCase());
    }
    
    const rawShipName = ship.boatName || 'Unknown Vessel';
    const cleanShipName = rawShipName.replace(/_/g, ' ').trim();
    
    const rawDestination = ship.destinationName || 'Unknown';
    const cleanDestination = rawDestination.replace(/_/g, ' ').trim();
    
    let shipColor = '#2E7D32'; // LIGHT GREEN for all other ships
    if (vesselType === 'TANKER') {
        shipColor = '#FF9800'; // Orange for tankers
    } else if (vesselType === 'CARGO_SHIP') {
        shipColor = '#2196F3'; // Blue for cargo ships
    }
    
    const shipIcon = L.divIcon({
        className: 'ship-marker-simple',
        html: `<i class="fas fa-ship" style="font-size: 14px; color: ${shipColor};"></i>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        popupAnchor: [0, -10]
    });
    
    const formattedSpeed = ship.speedKmh ? `${ship.speedKmh} km/h` : 'N/A';
    const formattedBearing = ship.bearingDeg ? `${ship.bearingDeg}°` : 'N/A';
    const formattedDraught = ship.draughtMeters ? `${ship.draughtMeters}m` : 'N/A';
    const formattedDimensions = ship.lengthMeters && ship.widthMeters ? 
        `${ship.lengthMeters}m × ${ship.widthMeters}m` : 'N/A';
    const formattedPosition = ship.point ? 
        `${ship.point.latitude?.toFixed(4) || 'N/A'}, ${ship.point.longitude?.toFixed(4) || 'N/A'}` : 'N/A';
    
    const popupHtml = `
    <div style="font-family: Arial, sans-serif; min-width: 280px; max-width: 320px;">
        <div style="background: linear-gradient(135deg, ${shipColor} 0%, ${darkenColor(shipColor)} 100%); color: white; padding: 12px; border-radius: 8px 8px 0 0; margin: -8px -8px 12px -8px;">
            <h3 style="margin: 0; font-size: 16px; font-weight: 600; line-height: 1.3;">
                ${cleanShipName}
            </h3>
            <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;">
                ${formattedVesselType}
            </p>
        </div>
        
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
                    <div style="color: #2d3748; font-size: 13px;">${cleanDestination}</div>
                </div>
            </div>
        </div>
        
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
        
        <div style="padding: 10px; background: #f8f9fa; border-radius: 6px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; text-align: center;">
                <div>
                    <div style="font-weight: 600; color: #4a5568; font-size: 11px; margin-bottom: 4px; display: flex; align-items: center; justify-content: center; gap: 4px;">
                        <i class="fas fa-gauge-high" style="color: #2196F3; font-size: 10px;"></i>
                        Speed
                    </div>
                    <div style="color: #2d3748; font-size: 13px; font-weight: 600;">${formattedSpeed}</div>
                </div>
                
                <div>
                    <div style="font-weight: 600; color: #4a5568; font-size: 11px; margin-bottom: 4px; display: flex; align-items: center; justify-content: center; gap: 4px;">
                        <i class="fas fa-compass" style="color: #2196F3; font-size: 10px;"></i>
                        Bearing
                    </div>
                    <div style="color: #2d3748; font-size: 13px; font-weight: 600;">${formattedBearing}</div>
                </div>
                
                <div>
                    <div style="font-weight: 600; color: #4a5568; font-size: 11px; margin-bottom: 4px; display: flex; align-items: center; justify-content: center; gap: 4px;">
                        <i class="fas fa-water" style="color: #2196F3; font-size: 10px;"></i>
                        Draught
                    </div>
                    <div style="color: #2d3748; font-size: 13px; font-weight: 600;">${formattedDraught}</div>
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

    const marker = L.marker([ship.point.latitude, ship.point.longitude], {icon: shipIcon})
        .bindPopup(popupHtml);

    return marker;
}

// Function to create disaster marker
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
            
            <div style="margin-top: 15px; border-top: 1px solid #e2e8f0; padding-top: 12px;">
                <a href="${disaster.link}" target="_blank" style="display: block; text-align: center; background: #4299e1; color: white; padding: 8px 12px; border-radius: 6px; text-decoration: none; font-weight: 500; font-size: 14px;">
                    View Details on GDACS
                </a>
            </div>
        </div>
    `;

    const marker = L.marker([disaster.lat, disaster.lon], {icon: disasterIcon})
        .bindPopup(popupHtml);

    return marker;
}

// Function to add disaster markers with bounding boxes
function addDisasterMarkers(disasters) {
    disasters.forEach(disaster => {
        const marker = createDisasterMarker(disaster);
        if (layerVisibility.disasters) {
            marker.addTo(map);
        }
        disasterMarkers.push(marker);
        
        // Add bounding box if available
        if (disaster.bbox && disaster.bbox.lat_min && disaster.bbox.lon_min && 
            disaster.bbox.lat_max && disaster.bbox.lon_max) {
            
            const alertLevel = disaster.alert_level || 'Unknown';
            const alertColor = alertColorMap[alertLevel] || alertColorMap['Unknown'];
            
            const bboxCoords = [
                [disaster.bbox.lat_min, disaster.bbox.lon_min],
                [disaster.bbox.lat_min, disaster.bbox.lon_max],
                [disaster.bbox.lat_max, disaster.bbox.lon_max],
                [disaster.bbox.lat_max, disaster.bbox.lon_min]
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

// Function to add ships from disaster areas
function addDisasterShips(shipsData) {
    if (!shipsData) return;
    
    let totalShips = 0;
    
    Object.keys(shipsData).forEach(gdacsId => {
        const disasterShips = shipsData[gdacsId];
        if (disasterShips && disasterShips.ships) {
            disasterShips.ships.forEach(ship => {
                if (ship.point && ship.point.latitude && ship.point.longitude) {
                    const marker = createShipMarker(ship);
if (layerVisibility.disasters) {
marker.addTo(map);
}
disasterShipMarkers.push(marker);
totalShips++;
}
});
}
});
console.log(`Added ${totalShips} ships from disaster areas`);
}
// Function to add ECA/MPA areas
function addEcaMpaAreas(ecaMpaData) {
clearEcaMpaLayer();
if (!ecaMpaData || !ecaMpaData.features || ecaMpaData.features.length === 0) {
    return;
}

console.log(`Adding ${ecaMpaData.features.length} ECA/MPA areas`);

ecaMpaLayer = L.geoJSON(ecaMpaData, {
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
            const rawName = feature.properties.name;
            const cleanName = rawName.replace(/_/g, ' ').trim();
            
            let popupContent = `<strong>${feature.properties.type} Area</strong><br>`;
            popupContent += `Name: ${cleanName}<br>`;
            
            if (feature.properties.description) {
                popupContent += `Description: ${feature.properties.description}`;
            }
            
            layer.bindPopup(popupContent);
        }
    }
});

if (layerVisibility.ecaMpa) {
    ecaMpaLayer.addTo(map);
}
}
// Function to add collision lines
function addCollisionLines(collisions) {
clearCollisionLines();
if (!collisions || collisions.length === 0) return;

const criticalCollisions = collisions.filter(collision => collision.risk_level === 'CRITICAL');

console.log(`Showing ${criticalCollisions.length} CRITICAL collisions (filtered from ${collisions.length} total)`);

currentCollisions = criticalCollisions;

criticalCollisions.forEach((collision, index) => {
    const vesselA = collision.vessel_a;
    const vesselB = collision.vessel_b;
    
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
                <h3 style="margin: 0; font-size: 16px; font-weight: 600;">🚨 CRITICAL Collision Alert</h3>
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
            
            <div style="text-align: center; margin-top: 10px;">
                <div style="background: #ff0000; color: white; padding: 6px 12px; border-radius: 20px; display: inline-block; font-weight: bold;">
                    CRITICAL RISK
                </div>
            </div>
        </div>
    `;

    collisionLine.bindPopup(popupContent);
    collisionLine.collisionIndex = index;
    
    if (layerVisibility.collisions) {
        collisionLine.addTo(map);
    }
    collisionLines.push(collisionLine);
});

if (criticalCollisions.length > 0) {
    displayCollisionList(criticalCollisions);
    showResults('Collision Detection', `Found ${criticalCollisions.length} CRITICAL collision(s) among all ${vesselMarkers.length} vessels`);
} else {
    showResults('Collision Detection', `No CRITICAL collision risks detected among ${vesselMarkers.length} vessels`);
    // Hide collision list if no critical collisions
    document.getElementById('collision-list-container').style.display = 'none';
}
}
// Function to display collision list in sidebar
function displayCollisionList(collisions) {
    const container = document.getElementById('collision-list-container');
    const listDiv = document.getElementById('collision-list');
    let html = '';

    collisions.forEach((collision, index) => {
        const vesselA = collision.vessel_a;
        const vesselB = collision.vessel_b;
        
        html += `
            <div onclick="goToCollision(${index})" style="background: linear-gradient(135deg, #ff1744 0%, #f50057 100%); 
                border: 2px solid #ff5252; padding: 12px; margin-bottom: 12px; border-radius: 8px; 
                cursor: pointer; transition: all 0.2s ease; box-shadow: 0 2px 8px rgba(255, 23, 68, 0.3);">
                
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <div style="font-weight: 700; color: #ffffff; font-size: 15px; text-shadow: 0 1px 2px rgba(0,0,0,0.3);">
                        <i class="fas fa-exclamation-triangle" style="animation: pulse 1.5s infinite;"></i> Collision ${index + 1}
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

    listDiv.innerHTML = html;
    container.style.display = 'block';
}
// Function to navigate to collision on map
function goToCollision(index) {
if (index >= 0 && index < currentCollisions.length) {
const collision = currentCollisions[index];
const vesselA = collision.vessel_a;
const vesselB = collision.vessel_b;
    const centerLat = (vesselA.lat + vesselB.lat) / 2;
    const centerLon = (vesselA.lon + vesselB.lon) / 2;
    
    map.setView([centerLat, centerLon], 10);
    
    if (collisionLines[index]) {
        collisionLines[index].openPopup();
    }
}
}
// Function to toggle collision list visibility
function toggleCollisionList() {
const container = document.getElementById('collision-list-container');
container.style.display = 'none';
}
// Function to toggle collision list collapse/expand
function toggleCollisionCollapse() {
    const content = document.getElementById('collision-list-content');
    const icon = document.getElementById('collision-collapse-icon');
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        icon.className = 'fas fa-chevron-up';
    } else {
        content.style.display = 'none';
        icon.className = 'fas fa-chevron-down';
    }
}

// Function to detect collisions among visible vessels
function detectCollisions() {
if (vesselMarkers.length < 2) {
showResults('Collision Detection', 'Need at least 2 vessels to check for collisions');
return;
}
const vessels = [];
vesselMarkers.forEach(marker => {
    const vesselData = marker.options.vesselData;
    if (vesselData && vesselData.point && 
        vesselData.speedKmh !== undefined && 
        vesselData.speedKmh !== null && 
        vesselData.speedKmh > 0 && 
        vesselData.bearingDeg !== undefined) {
        vessels.push({
            mmsi: vesselData.mmsi || 'Unknown',
            name: vesselData.boatName || 'Unknown',
            lat: vesselData.point.latitude,
            lon: vesselData.point.longitude,
            speed_kmh: vesselData.speedKmh,
            bearing_deg: vesselData.bearingDeg
        });
    }
});

fetch('/api/detect_collisions', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({ vessels: vessels })
})
.then(response => response.json())
.then(collisions => {
    if (collisions && collisions.length > 0) {
        addCollisionLines(collisions);
        showResults('Collision Detection', `Found ${collisions.length} potential collision(s)`);
    } else {
        showResults('Collision Detection', 'No collision risks detected');
    }
})
.catch(error => {
    console.error('Error detecting collisions:', error);
    showResults('Collision Detection', 'Error detecting collisions');
});
}
// Function to show all vessels in selected area
function showAllVessels() {
    const oceanRegion = document.getElementById('ocean-region').value;
    const limitInput = document.getElementById('vessel-limit').value;
    const limit = limitInput ? parseInt(limitInput) : 0;
    
    const isRedrawing = customBounds && currentBounds;
    
    if (!isRedrawing) {
        clearVesselMarkers();
        clearCollisionLines();
        clearDisasterMarkers();
        clearEcaMpaLayer();
    }

    const btn = document.getElementById('show-vessels-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
    btn.disabled = true;

    let requestData = { limit: limit };
    let apiEndpoint = '/api/vessels_in_area';

    if (customBounds) {
        // Use custom drawn bounds with new endpoint
        apiEndpoint = '/api/vessels_in_custom_bbox';
        requestData.sw_lat = customBounds.sw_lat;
        requestData.sw_lon = customBounds.sw_lon;
        requestData.ne_lat = customBounds.ne_lat;
        requestData.ne_lon = customBounds.ne_lon;
    } else if (oceanRegion) {
        requestData.ocean_region = oceanRegion;
    } else {
        const bounds = map.getBounds();
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();
        
        requestData.sw_lat = sw.lat;
        requestData.sw_lon = sw.lng;
        requestData.ne_lat = ne.lat;
        requestData.ne_lon = ne.lng;
    }

    fetch(apiEndpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success && data.vessels && data.vessels.length > 0) {
            // Store current bounds
            currentBounds = data.bounds;
            
            // Add new vessels
            data.vessels.forEach(vessel => {
                const marker = createShipMarker(vessel);
                marker.options.vesselData = vessel;
                if (layerVisibility.ships) {
                    marker.addTo(map);
                }
                vesselMarkers.push(marker);
            });
            
            const totalVesselCount = vesselMarkers.length;
            
            // Fit map to bounds if ocean region or custom bbox was used
            if ((oceanRegion || customBounds) && data.bounds) {
                map.fitBounds([
                    [data.bounds.sw_lat, data.bounds.sw_lon],
                    [data.bounds.ne_lat, data.bounds.ne_lon]
                ]);
            }
            
            const countDiv = document.getElementById('vessel-count');
            const countText = document.getElementById('vessel-count-text');
            countText.textContent = `${totalVesselCount} vessel${totalVesselCount !== 1 ? 's' : ''} loaded`;
            countDiv.style.display = 'block';
            
            showResults('Vessel Tracking', `Loaded ${totalVesselCount} vessel(s) total. Use buttons below to check disasters, protected areas, or collisions.`);
        } else {
            showResults('Vessel Tracking', 'No vessels found in this area');
            currentBounds = null;
        }
        
        btn.innerHTML = originalText;
        btn.disabled = false;
    })
    .catch(error => {
        console.error('Error fetching vessels:', error);
        showResults('Vessel Tracking', 'Failed to fetch vessels');
        btn.innerHTML = originalText;
        btn.disabled = false;
    });
}

// Function to check disasters in current area
function checkDisastersInArea() {
    if (!currentBounds) {
        alert('Please load vessels first to set the region');
        return;
    }
    
    // Show loading indicator
    showResults('Disaster Areas', '<i class="fas fa-spinner fa-spin"></i> Checking disaster areas...');
    
    fetch('/api/disasters_in_area', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(currentBounds)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Don't clear existing disasters, just add new ones
            
            if (data.disasters && data.disasters.length > 0) {
                addDisasterMarkers(data.disasters);
                
                if (data.ships) {
                    addDisasterShips(data.ships);
                }
                
                // Calculate total disaster count
                const totalDisasterMarkers = disasterMarkers.filter(m => m instanceof L.Marker).length;
                showResults('Disaster Areas', `Found ${totalDisasterMarkers} disaster(s) total in all regions`);
            } else {
                showResults('Disaster Areas', `No new disasters found in this region. Total: ${disasterMarkers.filter(m => m instanceof L.Marker).length}`);
            }
        }
    })
    .catch(error => {
        console.error('Error fetching disasters:', error);
        showResults('Disaster Areas', 'Failed to fetch disasters');
    });
}

// Function to check collisions
function checkCollisions() {
    if (vesselMarkers.length === 0) {
        alert('Please load vessels first using "Load Vessels"');
        return;
    }
    
    // Show loading indicator
    showResults('Collision Detection', '<i class="fas fa-spinner fa-spin"></i> Detecting collisions...');
    
    detectCollisions();
}

// Function to detect collisions among visible vessels
function detectCollisions() {
    if (vesselMarkers.length < 2) {
        showResults('Collision Detection', 'Need at least 2 vessels to check for collisions');
        return;
    }
    
    const vessels = [];
    vesselMarkers.forEach(marker => {
        const vesselData = marker.options.vesselData;
        if (vesselData && vesselData.point && vesselData.speedKmh !== undefined && vesselData.bearingDeg !== undefined) {
            vessels.push({
                mmsi: vesselData.mmsi || 'Unknown',
                name: vesselData.boatName || 'Unknown',
                lat: vesselData.point.latitude,
                lon: vesselData.point.longitude,
                speed_kmh: vesselData.speedKmh,
                bearing_deg: vesselData.bearingDeg
            });
        }
    });

    fetch('/api/detect_collisions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ vessels: vessels })
    })
    .then(response => response.json())
    .then(collisions => {
        if (collisions && collisions.length > 0) {
            addCollisionLines(collisions);
            showResults('Collision Detection', `Found ${collisions.length} potential collision(s)`);
        } else {
            showResults('Collision Detection', 'No collision risks detected');
        }
    })
    .catch(error => {
        console.error('Error detecting collisions:', error);
        showResults('Collision Detection', 'Error detecting collisions');
    });
}

// Function to check ECA/MPA in current area
function checkEcaMpaInArea() {
    if (!currentBounds) {
        alert('Please load vessels first to set the region');
        return;
    }
    
    // Check if there are any vessels loaded
    if (vesselMarkers.length === 0) {
        showResults('Protected Areas', 'No vessels in area. Load vessels first to check protected areas.');
        return;
    }
    
    // Show loading indicator
    showResults('Protected Areas', '<i class="fas fa-spinner fa-spin"></i> Checking protected areas...');
    
    fetch('/api/eca_mpa_in_area', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(currentBounds)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Don't clear existing ECA/MPA, add new ones to the existing layer
            
            if (data.eca_mpa) {
                // If no layer exists yet, create it normally
                if (!ecaMpaLayer) {
                    addEcaMpaAreas(data.eca_mpa);
                } else {
                    // Add new areas to existing layer
                    const newLayer = L.geoJSON(data.eca_mpa, {
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
                            }
                        },
                        onEachFeature: function(feature, layer) {
                            if (feature.properties && feature.properties.name) {
                                const rawName = feature.properties.name;
                                const cleanName = rawName.replace(/_/g, ' ').trim();
                                
                                let popupContent = `<strong>${feature.properties.type} Area</strong><br>`;
                                popupContent += `Name: ${cleanName}<br>`;
                                
                                if (feature.properties.description) {
                                    popupContent += `Description: ${feature.properties.description}`;
                                }
                                
                                layer.bindPopup(popupContent);
                            }
                        }
                    });
                    
                    // Add new layers to existing ecaMpaLayer
                    newLayer.eachLayer(function(layer) {
                        ecaMpaLayer.addLayer(layer);
                    });
                }
                
                // Count total areas
                let totalAreas = 0;
                if (ecaMpaLayer) {
                    ecaMpaLayer.eachLayer(function() {
                        totalAreas++;
                    });
                }
                
                showResults('Protected Areas', `Found ${totalAreas} ECA/MPA area(s) total with vessels`);
            } else {
                let totalAreas = 0;
                if (ecaMpaLayer) {
                    ecaMpaLayer.eachLayer(function() {
                        totalAreas++;
                    });
                }
                showResults('Protected Areas', `No new ECA/MPA areas found. Total: ${totalAreas}`);
            }
        }
    })
    .catch(error => {
        console.error('Error fetching ECA/MPA:', error);
        showResults('Protected Areas', 'Failed to fetch protected areas');
    });
}

// Function to check collisions
function checkCollisions() {
if (vesselMarkers.length === 0) {
alert('Please load vessels first using "Load Vessels"');
return;
}
detectCollisions();
}
// Function to show results in sidebar
function showResults(title, content) {
    const container = document.getElementById('results-container');
    const cardId = 'card-' + title.toLowerCase().replace(/\s+/g, '-');
    let existingCard = document.getElementById(cardId);
    
    if (existingCard) {
        existingCard.querySelector('.card-content').innerHTML = content;
    } else {
        const card = document.createElement('div');
        card.id = cardId;
        card.style.cssText = 'margin-bottom: 15px; padding: 15px; background-color: rgba(255, 255, 255, 0.1); border-radius: 5px;';
        card.innerHTML = `
            <h3 style="font-size: 16px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.2);">
                ${title}
            </h3>
            <div class="card-content" style="font-size: 14px; line-height: 1.5;">${content}</div>
        `;
        container.appendChild(card);
    }
    container.style.display = 'block';
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
// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
const legend = document.querySelector('.legend');
const toggleButton = document.getElementById('legend-toggle-btn');
if (!legend.style.display) {
    legend.style.display = 'block';
}

if (legend.style.display === 'none') {
    toggleButton.innerHTML = '<i class="fas fa-eye"></i>';
    toggleButton.title = 'Show Legend';
} else {
    toggleButton.innerHTML = '<i class="fas fa-layer-group"></i>';
    toggleButton.title = 'Hide Legend';
}

toggleButton.addEventListener('click', toggleLegend);

// Add collision collapse handler
const collisionHeader = document.getElementById('collision-header');
if (collisionHeader) {
    collisionHeader.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleCollisionCollapse();
    });
}

// Add ocean region change handler to clear custom bbox
document.getElementById('ocean-region').addEventListener('change', function() {
    if (this.value && customBounds) {
        // User selected ocean region, clear custom bbox
        if (drawnRectangle) {
            map.removeLayer(drawnRectangle);
            drawnRectangle = null;
        }
        customBounds = null;
        document.getElementById('bbox-status').style.display = 'none';
        document.getElementById('draw-bbox-btn').innerHTML = '<i class="fas fa-draw-polygon"></i> Draw Custom Area';
    }
});

// Add event listeners for toggle controls
document.getElementById('toggle-ships').addEventListener('change', function() {
    toggleLayerVisibility('ships', this.checked);
});

document.getElementById('toggle-disasters').addEventListener('change', function() {
    toggleLayerVisibility('disasters', this.checked);
});

document.getElementById('toggle-eca-mpa').addEventListener('change', function() {
    toggleLayerVisibility('ecaMpa', this.checked);
});
});