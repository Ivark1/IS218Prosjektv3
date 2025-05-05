/**
 * Population Map Module
 * Handles leaflet map initialization and population data display
 */

document.addEventListener('DOMContentLoaded', function() {
    // Initialize the map
    initMap();
});

/**
 * Initialize the map with base layer and population data
 */
function initMap() {
    try {
        // Check if Proj4js is loaded
        if (typeof proj4 === 'undefined') {
            console.error('Proj4js library not loaded! Please add the script tag in your HTML.');
            return;
        }

        console.log('Map initialization started');

        // Define projection for Norway - UTM Sone 32N (EPSG:25832)
        proj4.defs('EPSG:25832', '+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');

        // Initialize Leaflet map
        const map = L.map('map').setView([58.163576619299235, 8.003306530291821], 10);
        console.log('Map created');

        // Add the base tile layer (OpenStreetMap)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }).addTo(map);
        console.log('Base map layer added');

        // Create a layer group for population data
        const populationLayer = L.layerGroup().addTo(map);

        // If population data exists, display it
        if (window.populationData) {
            try {
                // Check if data is a string and parse it
                let parsedData = window.populationData;
                if (typeof window.populationData === 'string') {
                    parsedData = JSON.parse(window.populationData);
                    console.log('Parsed population data from string');
                }
                
                if (Array.isArray(parsedData) && parsedData.length > 0) {
                    console.log('Population data is an array with', parsedData.length, 'items');
                    // Display a sample of the data to debug
                    console.log('First item sample:', parsedData[0]);
                    
                    displayPopulationData(map, populationLayer, parsedData);
                } else {
                    console.log('Population data is empty or not an array:', parsedData);
                }
            } catch (error) {
                console.error('Error processing population data:', error);
            }
        } else {
            console.log('No population data available for display (undefined)');
        }

        // Create a legend
        createLegend(map);

        // Make sure the map renders correctly
        setTimeout(() => {
            map.invalidateSize();
        }, 100);

        console.log('Map initialization completed');

    } catch (error) {
        console.error('Map initialization error:', error);
    }
}

/**
 * Display population data on the map
 * @param {Object} map - Leaflet map instance
 * @param {Object} layer - Layer group to add population data to
 * @param {Array} populationData - Array of population data objects
 */
function displayPopulationData(map, layer, populationData) {
    console.log(`Attempting to display ${populationData.length} population areas`);
    
    // Clear existing data
    layer.clearLayers();
    
    // Process each population area
    let successCount = 0;
    let errorCount = 0;
    
    populationData.forEach((area, index) => {
        try {
            // Get geometry from the 'område' column
            const geometry = area.geom || area.område;
            
            // Get population from 'totalBefolkning' - convert from string to number
            const population = typeof area.poptot !== 'undefined' ? 
                parseInt(area.poptot, 10) : 
                (area.totalBefolkning ? parseInt(area.totalBefolkning, 10) : 0);
            
            // Skip if no geometry data
            if (!geometry) {
                console.warn(`Area ${index} has no geometry data`);
                errorCount++;
                return;
            }
            
            // Process geometry - it might be in different formats
            let polygonCoords = [];
            
            // Check if it's a GeoJSON object
            if (typeof geometry === 'object' && geometry.type && geometry.coordinates) {
                // Handle different geometry types
                if (geometry.type === 'Polygon') {
                    // For Polygon geometries, use the first ring of coordinates (outer ring)
                    const coords = geometry.coordinates[0];
                    
                    if (!coords || !Array.isArray(coords)) {
                        console.warn(`Invalid Polygon coordinates for area ${index}`);
                        errorCount++;
                        return;
                    }
                    
                    // Build coordinates array for Leaflet
                    coords.forEach(coord => {
                        try {
                            if (!Array.isArray(coord) || coord.length < 2) {
                                throw new Error('Invalid coordinate format');
                            }
                            
                            // Check if UTM conversion is needed
                            if (coord[0] > 180 || coord[1] > 90) { // Likely UTM coordinates
                                const wgs84 = convertUTMToWGS84(coord[0], coord[1]);
                                polygonCoords.push([wgs84[1], wgs84[0]]); // [lat, lng] for Leaflet
                            } else {
                                // Leaflet uses [lat, lng] order but GeoJSON uses [lng, lat]
                                polygonCoords.push([coord[1], coord[0]]);
                            }
                        } catch (err) {
                            console.warn(`Error processing coordinate in area ${index}:`, err);
                        }
                    });
                } 
                // Handle MultiPolygon geometry type
                else if (geometry.type === 'MultiPolygon') {
                    // Take the first polygon from MultiPolygon for simplicity
                    const coords = geometry.coordinates[0][0];
                    
                    if (!coords || !Array.isArray(coords)) {
                        console.warn(`Invalid MultiPolygon coordinates for area ${index}`);
                        errorCount++;
                        return;
                    }
                    
                    // Build coordinates array for Leaflet
                    coords.forEach(coord => {
                        try {
                            if (!Array.isArray(coord) || coord.length < 2) {
                                throw new Error('Invalid coordinate format');
                            }
                            
                            // Check if UTM conversion is needed
                            if (coord[0] > 180 || coord[1] > 90) { // Likely UTM coordinates
                                const wgs84 = convertUTMToWGS84(coord[0], coord[1]);
                                polygonCoords.push([wgs84[1], wgs84[0]]); // [lat, lng] for Leaflet
                            } else {
                                // Leaflet uses [lat, lng] order but GeoJSON uses [lng, lat]
                                polygonCoords.push([coord[1], coord[0]]);
                            }
                        } catch (err) {
                            console.warn(`Error processing coordinate in area ${index}:`, err);
                        }
                    });
                }
                else {
                    console.warn(`Unsupported geometry type for area ${index}: ${geometry.type}`);
                    errorCount++;
                    return;
                }
            } 
            // Geometry might be a string representation of WKT or EWKB
            else if (typeof geometry === 'string') {
                console.warn(`Geometry is a string for area ${index}, needs conversion. This is not supported yet.`);
                errorCount++;
                return;
            }
            else {
                console.warn(`Unknown geometry format for area ${index}`);
                errorCount++;
                return;
            }
            
            // Create polygon only if we have enough coordinates
            if (polygonCoords.length < 3) {
                console.warn(`Not enough valid coordinates for area ${index}`);
                errorCount++;
                return;
            }
            
            // Determine color based on population
            const color = getColorByPopulation(population);
            
            // Create the polygon and add to map
            const polygon = L.polygon(polygonCoords, {
                color: '#666',
                weight: 1,
                opacity: 0.7,
                fillColor: color,
                fillOpacity: 0.5
            }).addTo(layer);
            
            // Create popup content with area information
            const popupContent = `
                <div class="population-popup">
                    <h4>Population Area</h4>
                    <p><strong>Population:</strong> ${population.toLocaleString()} people</p>
                    ${area.grunnkretsnavn ? `<p><strong>Area:</strong> ${area.grunnkretsnavn}</p>` : ''}
                    ${area.kommunenavn ? `<p><strong>Municipality:</strong> ${area.kommunenavn}</p>` : ''}
                </div>
            `;
            
            polygon.bindPopup(popupContent);
            successCount++;
        } catch (error) {
            console.error(`Error processing population area ${index}:`, error);
            errorCount++;
        }
    });
    
    console.log(`Population loading complete: ${successCount} areas displayed, ${errorCount} errors.`);
    
    // If no items were displayed successfully, show an error
    if (successCount === 0) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'map-error';
        errorDiv.innerHTML = '<strong>Error:</strong> Could not display population data on the map. Please check the data format.';
        errorDiv.style.position = 'absolute';
        errorDiv.style.top = '10px';
        errorDiv.style.left = '50%';
        errorDiv.style.transform = 'translateX(-50%)';
        errorDiv.style.background = 'rgba(255, 0, 0, 0.7)';
        errorDiv.style.color = 'white';
        errorDiv.style.padding = '10px';
        errorDiv.style.borderRadius = '5px';
        errorDiv.style.zIndex = '1000';
        
        document.querySelector('.map-container').appendChild(errorDiv);
    }
}

/**
 * Create a legend for population density
 * @param {Object} map - Leaflet map instance
 */
function createLegend(map) {
    // Create a new legend control
    const legend = L.control({ position: 'bottomright' });
    
    legend.onAdd = function() {
        const div = L.DomUtil.create('div', 'legend');
        div.innerHTML = `
            <div style="background: white; padding: 10px; border-radius: 5px; box-shadow: 0 1px 5px rgba(0,0,0,0.4);">
                <h4 style="margin: 0 0 5px 0; text-align: center;">Population</h4>
                <div style="display: flex; align-items: center; margin-bottom: 5px;">
                    <span style="display: inline-block; width: 20px; height: 20px; background-color: #BD0026; margin-right: 5px;"></span>
                    <span>2000+</span>
                </div>
                <div style="display: flex; align-items: center; margin-bottom: 5px;">
                    <span style="display: inline-block; width: 20px; height: 20px; background-color: #FC4E2A; margin-right: 5px;"></span>
                    <span>1000-2000</span>
                </div>
                <div style="display: flex; align-items: center; margin-bottom: 5px;">
                    <span style="display: inline-block; width: 20px; height: 20px; background-color: #FD8D3C; margin-right: 5px;"></span>
                    <span>500-1000</span>
                </div>
                <div style="display: flex; align-items: center; margin-bottom: 5px;">
                    <span style="display: inline-block; width: 20px; height: 20px; background-color: #FEB24C; margin-right: 5px;"></span>
                    <span>100-500</span>
                </div>
                <div style="display: flex; align-items: center;">
                    <span style="display: inline-block; width: 20px; height: 20px; background-color: #FFEDA0; margin-right: 5px;"></span>
                    <span>0-100</span>
                </div>
            </div>
        `;
        return div;
    };
    
    legend.addTo(map);
}

/**
 * Get color based on population density
 * @param {number} population - Population count
 * @returns {string} - Hex color code
 */
function getColorByPopulation(population) {
    if (population > 2000) return '#BD0026'; // Very high density
    if (population > 1000) return '#FC4E2A'; // High density
    if (population > 500) return '#FD8D3C';  // Medium density
    if (population > 100) return '#FEB24C';  // Low-medium density
    return '#FFEDA0';                       // Low density
}

/**
 * Convert coordinates from UTM to WGS84
 * @param {number} easting - UTM easting coordinate
 * @param {number} northing - UTM northing coordinate
 * @returns {Array} - WGS84 coordinates [longitude, latitude]
 */
function convertUTMToWGS84(easting, northing) {
    return proj4('EPSG:25832', 'WGS84', [easting, northing]);
}