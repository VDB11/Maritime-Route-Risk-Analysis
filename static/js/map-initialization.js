/**
 * Map Initialization Module
 * Handles Leaflet map setup, tile layers, controls, and UI
 * Depends on: Leaflet.js
 */

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
    attribution: '&copy; OpenStreetMap contributors &copy; CartoDB',
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
window.chokepointCollisions = [];

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
};

// Sidebar toggle functionality
document.addEventListener("DOMContentLoaded", () => {
    const sidebar = document.querySelector(".sidebar");
    const closeBtn = document.getElementById("sidebar-close");
    const openBtn = document.getElementById("sidebar-open");

    if (closeBtn && openBtn && sidebar) {
        closeBtn.addEventListener("click", () => {
            sidebar.classList.add("collapsed");
            openBtn.style.display = 'block';
            map.invalidateSize();
        });

        openBtn.addEventListener("click", () => {
            sidebar.classList.remove("collapsed");
            openBtn.style.display = 'none';
            map.invalidateSize();
        });
    }
});

// Export map and global variables for use in other modules
window.map = map;
window.routeLayer = routeLayer;
window.disasterMarkers = disasterMarkers;
window.portMarkers = portMarkers;
window.shipMarkers = shipMarkers;
window.collisionLines = collisionLines;
window.chokepointMarkers = chokepointMarkers;
window.chokepointShipMarkers = chokepointShipMarkers;
window.alertColorMap = alertColorMap;
window.layerVisibility = layerVisibility;