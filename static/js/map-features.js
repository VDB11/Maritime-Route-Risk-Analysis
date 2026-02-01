/**
 * Map Features Module
 * Handles markers, layers, popups, and visual elements on the map
 * Depends on: map-initialization.js, Leaflet.js
 */

// Helper function to darken a color for gradient
function darkenColor(color) {
    if (color === '#2E7D32') return '#76C776'; // Darker light green
    if (color === '#2196F3') return '#1976D2'; // Darker blue
    if (color === '#FF9800') return '#F57C00'; // Darker orange
    return color; // Fallback
}

// Function to clear all map layers
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

    // CLEAR collision lines properly
    if (collisionLines) {
        collisionLines.forEach(line => {
            if (map.hasLayer(line)) {
                map.removeLayer(line);
            }
        });
        collisionLines = []; // Clear the array
    }
    
    // Clear collision data
    window.currentRouteCollisions = [];
    window.chokepointCollisions = [];

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

// Function to create ship markers
function createShipMarker(ship) {
    const vesselType = ship.vesselType || 'UNKNOWN';
    
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
    
    let shipColor = '#2E7D32'; // LIGHT GREEN for all other ships
    if (vesselType === 'TANKER') {
        shipColor = '#FF9800'; // Orange for tankers
    } else if (vesselType === 'CARGO_SHIP') {
        shipColor = '#2196F3'; // Blue for cargo ships
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
        <div style="background: linear-gradient(135deg, ${shipColor} 0%, ${darkenColor(shipColor)} 100%); color: white; padding: 12px; border-radius: 8px 8px 0 0; margin: -8px -8px 12px -8px;">
            <h3 style="margin: 0; font-size: 16px; font-weight: 600; line-height: 1.3;">
                ${cleanShipName}
            </h3>
            <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;">
                ${formattedVesselType}
            </p>
        </div>
        
        <!-- See Vessel Details Button -->
        <div style="margin-bottom: 12px;">
            <button onclick="openVesselDetails(${JSON.stringify(ship).replace(/"/g, '&quot;')}); event.stopPropagation();"
                    style="width: 100%; background: linear-gradient(135deg, #4facfe 0%, #3a8fd4 100%); 
                           color: white; border: none; padding: 10px; border-radius: 6px; 
                           font-weight: 600; cursor: pointer; font-family: Arial, sans-serif;
                           transition: all 0.3s ease; font-size: 14px;"
                    onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 5px 15px rgba(79, 172, 254, 0.4)';"
                    onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none';">
                <i class="fas fa-ship"></i> See Vessel Details
            </button>
        </div>
        
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
                <i class="fas fa-map-marker-alt"></i>
            </div>
            <div>
                <div style="font-weight: 600; color: #4a5568; font-size: 12px;">Destination</div>
                <div style="color: #2d3748; font-size: 13px;">${cleanDestination}</div>
            </div>
        </div>
        
        <div style="display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: center; margin-bottom: 6px;">
            <div style="color: #2196F3; font-size: 12px; width: 20px;">
                <i class="fas fa-gauge-high"></i>
            </div>
            <div>
                <div style="font-weight: 600; color: #4a5568; font-size: 12px;">Speed</div>
                <div style="color: #2d3748; font-size: 13px;">${formattedSpeed}</div>
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

function createWeatherSection(lat, lon) {
    // Return a harmless empty node so callers using .outerHTML don’t crash
    const empty = document.createElement('div');
    empty.style.display = 'none';
    return empty;
}

// Function to create piracy incident marker
function createPiracyMarker(incident) {
    const piracyIcon = L.divIcon({
        className: 'piracy-icon',
        html: `<i class="fas fa-skull-crossbones" style="color: #8B0000; font-size: 15px; text-shadow: 1px 1px 2px rgba(0,0,0,0.4);"></i>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        popupAnchor: [0, -10]
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
            
            if (collisionLines) {
                collisionLines.forEach(line => {
                    if (visible) {
                        if (!map.hasLayer(line)) line.addTo(map);
                    } else {
                        if (map.hasLayer(line)) map.removeLayer(line);
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
                <button onclick="window.open('/port_details?port_code=${portData.code}&type=${isOrigin ? 'origin' : 'destination'}', '_blank')"
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

// Function to open vessel details
function openVesselDetails(shipData) {
    const mmsi = shipData.mmsi;
    // Store ship data in sessionStorage
    sessionStorage.setItem(`vessel_${mmsi}`, JSON.stringify(shipData));
    // Open new tab
    window.open(`/vessel_details?mmsi=${mmsi}`, '_blank');
}

// Initialize event listeners when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Legend toggle
    const legend = document.querySelector('.legend');
    const toggleButton = document.getElementById('legend-toggle-btn');
    
    if (legend && toggleButton) {
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
    }
    
    // Add event listeners for toggle controls
    const disastersToggle = document.getElementById('toggle-disasters');
    const congestionToggle = document.getElementById('toggle-congestion');
    const protectedToggle = document.getElementById('toggle-protected');
    
    if (disastersToggle) {
        disastersToggle.addEventListener('change', function() {
            toggleLayerVisibility('disasters', this.checked);
        });
    }

    if (congestionToggle) {
        congestionToggle.addEventListener('change', function() {
            toggleLayerVisibility('congestion', this.checked);
        });
    }

    if (protectedToggle) {
        protectedToggle.addEventListener('change', function() {
            toggleLayerVisibility('protected', this.checked);
        });
    }
});