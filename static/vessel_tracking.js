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

// Global variables
let vesselMarkers = [];
let disasterMarkers = [];
let collisionLines = [];

// Visibility state
let layerVisibility = {
    ships: true,
    disasters: true,
    collisions: true
};

// Alert color mapping
const alertColorMap = {
    'Red': '#ff4444',
    'Orange': '#ff8800', 
    'Green': '#44ff44',
    'Unknown': '#888888'
};

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
            break;
            
        case 'disasters':
            disasterMarkers.forEach(marker => {
                if (visible) {
                    if (!map.hasLayer(marker)) marker.addTo(map);
                } else {
                    if (map.hasLayer(marker)) map.removeLayer(marker);
                }
            });
            break;
            
        case 'collisions':
            collisionLines.forEach(line => {
                if (visible) {
                    if (!map.hasLayer(line)) line.addTo(map);
                } else {
                    if (map.hasLayer(line)) map.removeLayer(line);
                }
            });
    }
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
}

// Function to clear collision lines
function clearCollisionLines() {
    collisionLines.forEach(line => {
        if (map.hasLayer(line)) {
            map.removeLayer(line);
        }
    });
    collisionLines = [];
}

// Function to create ship marker
function createShipMarker(ship) {
    const vesselType = ship.vesselType || 'UNKNOWN';
    let shipColor = '#2196F3'; // Default blue for cargo ships
    
    if (vesselType === 'TANKER') {
        shipColor = '#FF9800'; // Orange for tankers
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
        <div style="background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%); color: white; padding: 12px; border-radius: 8px 8px 0 0; margin: -8px -8px 12px -8px;">
            <h3 style="margin: 0; font-size: 16px; font-weight: 600; line-height: 1.3;">
                ${ship.boatName || 'Unknown Vessel'}
            </h3>
            <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;">
                ${ship.vesselType || 'Unknown Type'}                
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
                    <div style="color: #2d3748; font-size: 13px;">${ship.destinationName || 'Unknown'}</div>
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
        html: `<i class="fas fa-exclamation-triangle" style="color: white; font-size: 14px; line-height: 26px;"></i>`,
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

// Function to add collision lines
function addCollisionLines(collisions) {
    clearCollisionLines();
    
    if (!collisions || collisions.length === 0) return;
    
    // Filter to show only CRITICAL collisions
    const criticalCollisions = collisions.filter(collision => collision.risk_level === 'CRITICAL');
    
    console.log(`Showing ${criticalCollisions.length} CRITICAL collisions (filtered from ${collisions.length} total)`);
    
    criticalCollisions.forEach(collision => {
        const vesselA = collision.vessel_a;
        const vesselB = collision.vessel_b;
        
        const collisionLine = L.polyline([
            [vesselA.lat, vesselA.lon],
            [vesselB.lat, vesselB.lon]
        ], {
            color: '#ff0000',  // ALWAYS RED for critical
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
        if (layerVisibility.collisions) {
            collisionLine.addTo(map);
        }
        collisionLines.push(collisionLine);
    });
    
    if (criticalCollisions.length === 0) {
        showResults('Collision Detection', 'No CRITICAL collision risks detected');
    }
}

// Function to detect collisions among visible vessels
function detectCollisions() {
    if (vesselMarkers.length < 2) {
        showResults('Collision Detection', 'Need at least 2 vessels to check for collisions');
        return;
    }
    
    // Extract vessel data from markers
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
    
    // Send to server for collision detection
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
            showResults('Collision Detection', `Found ${collisions.length} collision risk(s)`);
        } else {
            showResults('Collision Detection', 'No collision risks detected');
        }
    })
    .catch(error => {
        console.error('Error detecting collisions:', error);
        showResults('Collision Detection', 'Error detecting collisions');
    });
}

// Function to show all vessels in current view
function showAllVessels() {
    const limit = parseInt(document.getElementById('vessel-limit').value) || 0;
    
    const bounds = map.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    
    clearVesselMarkers();
    clearCollisionLines();
    
    const btn = document.getElementById('show-vessels-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
    btn.disabled = true;
    
    fetch('/api/vessels_in_area', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            sw_lat: sw.lat,
            sw_lon: sw.lng,
            ne_lat: ne.lat,
            ne_lon: ne.lng,
            limit: limit
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success && data.vessels && data.vessels.length > 0) {
            data.vessels.forEach(vessel => {
                const marker = createShipMarker(vessel);
                // Store vessel data on marker for later use
                marker.options.vesselData = vessel;
                if (layerVisibility.ships) {
                    marker.addTo(map);
                }
                vesselMarkers.push(marker);
            });
            
            const countDiv = document.getElementById('vessel-count');
            const countText = document.getElementById('vessel-count-text');
            countText.textContent = `Showing ${data.count} vessel${data.count !== 1 ? 's' : ''}`;
            countDiv.style.display = 'block';
            
            showResults('Vessel Tracking', `Found ${data.count} vessel(s) in view`);
        } else {
            showResults('Vessel Tracking', 'No vessels found in this area');
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

// Function to check disasters
function checkDisasters() {
    fetch('/api/disasters')
    .then(response => response.json())
    .then(disasters => {
        clearDisasterMarkers();
        
        disasters.forEach(disaster => {
            const marker = createDisasterMarker(disaster);
            if (layerVisibility.disasters) {
                marker.addTo(map);
            }
            disasterMarkers.push(marker);
        });
        
        showResults('Disaster Areas', `Found ${disasters.length} current disaster(s)`);
    })
    .catch(error => {
        console.error('Error fetching disasters:', error);
        showResults('Disaster Areas', 'Failed to fetch disasters');
    });
}

// Function to check collisions
function checkCollisions() {
    if (vesselMarkers.length === 0) {
        alert('Please load vessels first using "Show All Vessels in View"');
        return;
    }
    
    detectCollisions();
}

// Function to show results in sidebar
function showResults(title, content) {
    document.getElementById('results-title').textContent = title;
    document.getElementById('results-content').innerHTML = content;
    document.getElementById('results-container').style.display = 'block';
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
    
    // Add event listeners for toggle controls
    document.getElementById('toggle-ships').addEventListener('change', function() {
        toggleLayerVisibility('ships', this.checked);
    });

    document.getElementById('toggle-disasters').addEventListener('change', function() {
        toggleLayerVisibility('disasters', this.checked);
    });

    document.getElementById('toggle-collisions').addEventListener('change', function() {
        toggleLayerVisibility('collisions', this.checked);
    });
});