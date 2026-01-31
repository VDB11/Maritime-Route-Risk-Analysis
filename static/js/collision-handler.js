/**
 * Collision Handler Module
 * Handles all collision detection, chokepoints, and related features
 * Depends on: map-initialization.js, map-features.js, Leaflet.js
 */

// Function to add collision lines
function addCollisionLines(collisionsData) {
    console.log("🎨 DRAWING COLLISION LINES:", collisionsData);
    
    // DON'T clear the array - we want to accumulate lines from multiple sources
    // Only remove these specific lines from the map if they exist
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
                    
                    <div style="background: #fff3cd; padding: 10px; border-radius: 6px; margin-top: 10px;">
                        <div style="font-weight: 600; color: #856404; font-size: 12px; margin-bottom: 4px;">Risk Assessment</div>
                        <div style="color: #856404; font-size: 13px;">
                            <strong>CPA Distance:</strong> ${collision.cpa_distance_m ? collision.cpa_distance_m.toFixed(0) : 'N/A'} meters<br>
                            <strong>Time to CPA:</strong> ${collision.tcpa_minutes ? collision.tcpa_minutes.toFixed(1) : 'N/A'} minutes<br>
                            <strong>Risk Level:</strong> <span style="color: #ff0000; font-weight: 700;">${collision.risk_level}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        collisionLine.bindPopup(popupContent);
        collisionLine.addTo(map);
        collisionLines.push(collisionLine);
    });
}

// Function to check all disaster collisions
function checkAllDisasterCollisions(shipsData) {
    if (!shipsData) return;
    
    console.log("🚨 === STARTING COLLISION DETECTION ===");
    
    let totalDisasters = 0;
    let processedDisasters = 0;
    const allCollisions = [];
    
    // Count total disasters
    Object.keys(shipsData).forEach(disasterId => {
        const disaster = shipsData[disasterId];
        if (disaster && disaster.ships && disaster.ships.length > 0) {
            totalDisasters++;
        }
    });
    
    console.log(`📊 Total disaster areas to check: ${totalDisasters}`);
    
    // Check collisions for each disaster area
    Object.keys(shipsData).forEach(disasterId => {
        const disaster = shipsData[disasterId];
        
        if (!disaster || !disaster.ships || disaster.ships.length === 0) {
            return;
        }
        
        console.log(`🔍 Checking collisions for disaster ${disasterId} (${disaster.ships.length} ships)`);
        
        fetch('/api/disaster_collisions', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ ships: disaster.ships })
        })
            .then(res => res.json())
            .then(collisions => {
                processedDisasters++;
                console.log(`📈 Progress: ${processedDisasters}/${totalDisasters} disaster areas processed`);
                
                if (collisions && collisions.length > 0) {
                    console.log(`⚠️ Found ${collisions.length} collisions in disaster ${disasterId}`);
                    allCollisions.push(...collisions);
                    
                    // Only add collision lines once when all disasters processed
                    if (processedDisasters === totalDisasters) {
                        addCollisionLines(allCollisions);
                        
                        // Add collision alert dropdown to sidebar
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
                        alertHeader.onclick = toggleCollisionDropdown;
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
                                        <div style="margin-bottom: 10px; padding: 8px; background: rgba(255, 255, 255, 0.15); 
                                            border-radius: 6px; backdrop-filter: blur(10px);">
                                            <strong style="color: #ffeb3b;">Vessel B:</strong> ${vesselB.name}
                                        </div>
                                        
                                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px;">
                                            <div style="background: rgba(255, 255, 255, 0.2); padding: 8px; border-radius: 6px; 
                                                text-align: center; backdrop-filter: blur(10px);">
                                                <div style="font-size: 11px; color: #ffeb3b; margin-bottom: 2px; text-transform: uppercase; 
                                                    letter-spacing: 0.5px;">CPA Distance</div>
                                                <div style="font-weight: 700; font-size: 16px; color: #ffffff;">
                                                    ${collision.cpa_distance_m ? collision.cpa_distance_m.toFixed(0) : 'N/A'}m
                                                </div>
                                            </div>
                                            <div style="background: rgba(255, 255, 255, 0.2); padding: 8px; border-radius: 6px; 
                                                text-align: center; backdrop-filter: blur(10px);">
                                                <div style="font-size: 11px; color: #ffeb3b; margin-bottom: 2px; text-transform: uppercase; 
                                                    letter-spacing: 0.5px;">Time to CPA</div>
                                                <div style="font-weight: 700; font-size: 16px; color: #ffffff;">
                                                   ${collision.tcpa_minutes ? collision.tcpa_minutes.toFixed(1) : 'N/A'} min
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
        
        map.setView([centerLat, centerLon], 12, {
            animate: true,
            duration: 0.5
        });
        
        if (collisionLines && collisionLines.length > index) {
            // Wait for map animation to complete, then open popup
            setTimeout(() => {
                collisionLines[index].openPopup();
            }, 600);
        }
    }
}

// Function to show chokepoints
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

    // Initialize chokepoint collisions array
    window.chokepointCollisions = [];

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

            const circle = L.circle([cp.lat, cp.lon], {
                radius: 100000, //chokepoint radius in meters
                color: '#ff0000',
                fillColor: '#ff0000',
                fillOpacity: 0.2,
                weight: 3,
                opacity: 0.8,
                interactive: false
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
                        <strong style="color: #ff0000;">${ships.length} ships</strong> in chokepoint area
                    </div>
                </div>
            `);
            
            // Add click event to zoom into chokepoint
            marker.on('click', function() {
                map.setView([cp.lat, cp.lon], 8);
            });

            // Also add click to circle
            circle.on('click', function() {
                map.setView([cp.lat, cp.lon], 8);
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
                        chokepointShipMarkers.push(shipMarker);
                    }
                });
                
                // Check collisions for this chokepoint
                fetch('/api/chokepoint_collisions', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ ships: ships })
                })
                .then(res => res.json())
                .then(collisions => {
                    if (collisions && collisions.length > 0) {
                        console.log(`Found ${collisions.length} collisions in ${cp.name}`);
                        
                        // Store the starting index in collisionLines array BEFORE adding new lines
                        const collisionLinesStartIndex = collisionLines.length;
                        
                        // Store collisions globally with their line indices
                        const collisionsWithIndices = collisions.map((collision, idx) => ({
                            ...collision,
                            lineIndex: collisionLinesStartIndex + idx,
                            chokepointName: cp.name
                        }));
                        
                        window.chokepointCollisions.push(...collisionsWithIndices);
                        
                        addCollisionLines(collisions);
                        
                        // Add collision alert dropdown to sidebar for chokepoint
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
                        const sanitizedName = cp.name.replace(/\s+/g, '-');
                        alertHeader.onclick = function() { toggleChokepointCollisionDropdown(cp.name); };
                        alertHeader.style.cssText = `
                            display: flex;
                            justify-content: space-between;
                            align-items: flex-start;
                            padding-right: 5px;
                            gap: 10px;
                        `;
                        alertHeader.innerHTML = `
                            <div style="flex: 1;">
                                <strong>🚨 Chokepoint Collision Alert!</strong> ${collisions.length} collision(s) detected in ${cp.name}
                            </div>
                            <i id="chokepoint-collision-dropdown-icon-${sanitizedName}" class="fas fa-chevron-down" style="font-size: 14px; flex-shrink: 0; margin-left: 10px;"></i>
                        `;

                        // Dropdown content (initially hidden)
                        const dropdownContent = document.createElement('div');
                        dropdownContent.id = `chokepoint-collision-dropdown-content-${sanitizedName}`;
                        dropdownContent.style.display = 'none';
                        dropdownContent.style.marginTop = '15px';
                        dropdownContent.style.paddingTop = '15px';
                        dropdownContent.style.borderTop = '1px solid rgba(133, 100, 4, 0.3)';

                        let html = '';
                        collisions.forEach((collision, index) => {
                            const globalIndex = window.chokepointCollisions.length - collisions.length + index;
                            const vesselA = collision.vessel_a;
                            const vesselB = collision.vessel_b;
                            
                            html += `
                                <div onclick="event.stopPropagation(); goToChokepointCollision(${globalIndex})" style="background: linear-gradient(135deg, #ff1744 0%, #f50057 100%); 
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
                                        <div style="margin-bottom: 10px; padding: 8px; background: rgba(255, 255, 255, 0.15); 
                                            border-radius: 6px; backdrop-filter: blur(10px);">
                                            <strong style="color: #ffeb3b;">Vessel B:</strong> ${vesselB.name}
                                        </div>
                                        
                                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px;">
                                            <div style="background: rgba(255, 255, 255, 0.2); padding: 8px; border-radius: 6px; 
                                                text-align: center; backdrop-filter: blur(10px);">
                                                <div style="font-size: 11px; color: #ffeb3b; margin-bottom: 2px; text-transform: uppercase; 
                                                    letter-spacing: 0.5px;">CPA Distance</div>
                                                <div style="font-weight: 700; font-size: 16px; color: #ffffff;">
                                                    ${collision.cpa_distance_m ? collision.cpa_distance_m.toFixed(0) : 'N/A'}m
                                                </div>
                                            </div>
                                            <div style="background: rgba(255, 255, 255, 0.2); padding: 8px; border-radius: 6px; 
                                                text-align: center; backdrop-filter: blur(10px);">
                                                <div style="font-size: 11px; color: #ffeb3b; margin-bottom: 2px; text-transform: uppercase; 
                                                    letter-spacing: 0.5px;">Time to CPA</div>
                                                <div style="font-weight: 700; font-size: 16px; color: #ffffff;">
                                                    ${collision.tcpa_minutes ? collision.tcpa_minutes.toFixed(1) : 'N/A'} min
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
                    }
                });
            }
        });

        // Reset button
        btn.innerHTML = originalText;
        btn.disabled = false;
    })
    .catch(error => {
        console.error('Error fetching chokepoint ships:', error);
        btn.innerHTML = originalText;
        btn.disabled = false;
    });
}

// Function to toggle chokepoint collision dropdown
function toggleChokepointCollisionDropdown(chokepointName) {
    const sanitizedName = chokepointName.replace(/\s+/g, '-');
    const content = document.getElementById(`chokepoint-collision-dropdown-content-${sanitizedName}`);
    const icon = document.getElementById(`chokepoint-collision-dropdown-icon-${sanitizedName}`);
    
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

// Function to navigate to chokepoint collision on map
function goToChokepointCollision(index) {
    if (window.chokepointCollisions && index >= 0 && index < window.chokepointCollisions.length) {
        const collision = window.chokepointCollisions[index];
        const vesselA = collision.vessel_a;
        const vesselB = collision.vessel_b;
        
        const centerLat = (vesselA.lat + vesselB.lat) / 2;
        const centerLon = (vesselA.lon + vesselB.lon) / 2;
        
        console.log(`Navigating to chokepoint collision ${index} in ${collision.chokepointName}`);
        console.log(`Collision line index: ${collision.lineIndex}`);
        console.log(`Total collision lines: ${collisionLines.length}`);
        
        map.setView([centerLat, centerLon], 12, {
            animate: true,
            duration: 0.5
        });
        
        // Use the stored line index to open the correct popup
        setTimeout(() => {
            if (collision.lineIndex !== undefined && 
                collisionLines && 
                collision.lineIndex < collisionLines.length) {
                console.log(`Opening popup for line index ${collision.lineIndex}`);
                collisionLines[collision.lineIndex].openPopup();
            } else {
                console.log(`Could not find collision line - lineIndex: ${collision.lineIndex}, total lines: ${collisionLines.length}`);
            }
        }, 600);
    }
}