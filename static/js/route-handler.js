/**
 * Route Handler Module
 * Manages route calculation, API requests, and route visualization
 * Depends on: map-initialization.js, map-features.js, jQuery
 */

// Calculate route button click handler
document.getElementById('calculate-route').addEventListener('click', function() {
    const originPort = document.getElementById('origin-port').value;
    const destPort = document.getElementById('dest-port').value;
    
    // Show loading
    document.getElementById('loading').style.display = 'block';
    document.getElementById('route-info').style.display = 'none';
    
    // Clear previous route and markers
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
        
        // Add ship markers if available (DISASTER AREA SHIPS)
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
            // Count recent vs older incidents
            const recentCount = data.piracy.incidents.filter(inc => {
                const incidentDate = new Date(inc.date);
                const now = new Date();
                const daysDiff = Math.floor((now - incidentDate) / (1000 * 60 * 60 * 24));
                return daysDiff <= 10;
            }).length;

            const olderCount = data.piracy.incidents.length - recentCount;

            alert.innerHTML = `<strong><i class="fas fa-skull-crossbones"></i> Piracy Alert!</strong> ${data.piracy.incidents.length} incident(s) detected (last 3 months)`;
            disasterAlerts.appendChild(alert);

            // Add separate alert for recent incidents
            if (recentCount > 0) {
                const recentAlert = document.createElement('div');
                recentAlert.className = 'alert-box';
                recentAlert.style.backgroundColor = '#ffebee';
                recentAlert.style.borderLeftColor = '#c62828';
                recentAlert.style.color = '#b71c1c';
                recentAlert.innerHTML = `<strong><i class="fas fa-exclamation-triangle"></i> RECENT INCIDENTS!</strong> ${recentCount} incident(s) in the last 10 days`;
                disasterAlerts.appendChild(recentAlert);
            }
            
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
        
        // Handle chokepoints
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