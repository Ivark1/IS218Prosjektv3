/**
 * Map configuration module
 * Handles projection setup and base map initialization
 */

// Initialize projection for Norway
function initializeProjection() {
    if (typeof proj4 === 'undefined') {
        console.error('Proj4js library not loaded! Please add the script tag in your HTML.');
        return false;
    }

    // Define projection for Norway - UTM Sone 32N (EPSG:25832)
    proj4.defs('EPSG:25832', '+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
    return true;
}

// Initialize base map
function initializeMap() {
    L.Icon.Default.imagePath = 'https://unpkg.com/leaflet@1.9.4/dist/images/';
    const map = L.map('map', {
        zoomControl: false,
    }).setView([58.163576619299235, 8.003306530291821], 13);
    

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);
    L.control.zoom({ position: 'topright' }).addTo(map);
    return map;
}

// Convert from UTM to WGS84 coordinates
function convertUTMToWGS84(utmEasting, utmNorthing) {
    return proj4('EPSG:25832', 'WGS84', [utmEasting, utmNorthing]);
}

// Calculate distance between two points
function calculateDistance(latlng1, latlng2) {
    return latlng1.distanceTo(latlng2);
}

export {
    initializeProjection,
    initializeMap,
    convertUTMToWGS84,
    calculateDistance
};