/**
 * Layers module
 * Handles creation and management of map layers
 */
import { convertUTMToWGS84 } from './config.js';
// Create all layer groups
function createLayers(map) {
    const shelterLayer = L.layerGroup().addTo(map);
    const bunkerLayer = L.layerGroup().addTo(map);
    const positionLayer = L.layerGroup().addTo(map);
    const customLayer = L.layerGroup().addTo(map);
    const routeLayer = L.layerGroup().addTo(map);
    const isochroneLayer = L.layerGroup();
    const populationLayer = L.layerGroup().addTo(map);
    
    return {
        shelterLayer,
        bunkerLayer,
        positionLayer,
        customLayer,
        routeLayer,
        isochroneLayer,
        populationLayer
    };
}
// Add shelters to the map
function addShelters(shelterData, shelterLayer, icon) {
    if (!shelterData || !shelterData.length) return;
    shelterData.forEach(point => {
        if (point.geom && point.geom.coordinates) {
            const coordinates = point.geom.coordinates;
            L.marker([coordinates[1], coordinates[0]], { icon: icon })
                .addTo(shelterLayer)
                .bindPopup('Alternativt Tilfluktsrom');
        }
    });
}
// Add bunkers to the map
function addBunkers(bunkerData, bunkerLayer, icon) {
    if (!bunkerData || !bunkerData.length) return;
    bunkerData.forEach((point, index) => {
        if (point.geom && point.geom.coordinates) {
            try {
                const utmEasting = point.geom.coordinates[0];
                const utmNorthing = point.geom.coordinates[1];
                // Convert coordinates
                const wgs84Coords = convertUTMToWGS84(utmEasting, utmNorthing);
                const lat = wgs84Coords[1];
                const lng = wgs84Coords[0];
                L.marker([lat, lng], { icon: icon })
                    .addTo(bunkerLayer)
                    .bindPopup(`
                        <b>Offentlig tilfluktsrom</b><br>
                        Addresse: ${point.adresse}<br>
                        Kapasitet: ${point.plasser} people<br>
                        Romnr: ${point.romnr}
                    `);
            } catch (error) {
                console.error(`Error converting coordinates for bunker ${index}:`, error);
            }
        }
    });
}
// Find closest marker from a layer group
function findClosestMarker(position, layerGroup) {
    let closestMarker = null;
    let closestDistance = 50000;
    layerGroup.eachLayer(function (layer) {
        if (layer instanceof L.Marker) {
            const distance = position.distanceTo(layer.getLatLng());
            if (distance < closestDistance) {
                closestDistance = distance;
                closestMarker = layer;
            }
        }
    });
    return {
        marker: closestMarker,
        distance: closestDistance
    };
}

// Setup click handling for population grid squares
function setupPopulationClickHandling(populationLayer, map) {
    if (!populationLayer || !map) return;
    
    populationLayer.eachLayer(function(layer) {
        // Store original click handler if exists
        const originalClickHandlers = layer._events && layer._events.click ? [...layer._events.click] : [];
        
        // Remove default click handler
        layer.off('click');
        
        // Add custom click handler
        layer.on('click', function(e) {
            // Extract population count from the layer
            let population = 'Ukjent';
            
            // Try different ways to get population data based on common structures
            if (layer.getPopup && layer.getPopup()) {
                const popupContent = layer.getPopup().getContent();
                const match = popupContent.match(/Befolkning:\s*(\d+)|(\d+)\s*personer/i);
                if (match && (match[1] || match[2])) {
                    population = match[1] || match[2];
                }
            } else if (layer.feature && layer.feature.properties) {
                // GeoJSON standard
                population = layer.feature.properties.population || 
                            layer.feature.properties.befolkning || 
                            layer.feature.properties.poptot ||
                            layer.feature.properties.count || 
                            'Ukjent';
            } else if (layer.options) {
                // Custom options
                population = layer.options.population || layer.options.befolkning || 'Ukjent';
            }
            
            // Store population data for use in the marker creation
            window.lastClickedPopulation = population;
            
            // Don't show the popup - this removes the white box
            // if (layer.getPopup && layer.getPopup()) {
            //     layer.openPopup(e.latlng);
            // }
            
            // Trigger a map click at the same location for marker placement
            setTimeout(function() {
                map.fire('click', {
                    latlng: e.latlng,
                    originalEvent: { 
                        synthetic: true,
                        populationData: population
                    }
                });
                
                // Add population info to the marker info panel after it's been updated
                setTimeout(function() {
                    const infoPanel = document.getElementById('position-info');
                    if (infoPanel) {
                        // Don't add population info if it's already there
                        if (!infoPanel.innerHTML.includes('Befolkning')) {
                            // Create population info element
                            const populationInfo = `
                                <div style="margin-top: 10px; padding: 10px; background-color: #fff9e9; border-radius: 4px;">
                                    <b>Befolkning:</b> ${population} personer
                                </div>
                            `;
                            
                            // Append to the panel
                            const currentContent = infoPanel.innerHTML;
                            // Find the end of the main content div to insert before
                            const mainContentEndIndex = currentContent.indexOf('</div>');
                            
                            if (mainContentEndIndex !== -1) {
                                // Insert the population info before the end of the first div
                                const newContent = 
                                    currentContent.substring(0, mainContentEndIndex) + 
                                    populationInfo + 
                                    currentContent.substring(mainContentEndIndex);
                                infoPanel.innerHTML = newContent;
                            } else {
                                // If we can't find the end of a div, just append
                                infoPanel.innerHTML += populationInfo;
                            }
                        }
                    }
                }, 100); // Small delay to ensure marker info is processed first
            }, 50);
            
            // Stop propagation
            L.DomEvent.stop(e);
        });
    });
}

export {
    createLayers,
    addShelters,
    addBunkers,
    findClosestMarker,
    setupPopulationClickHandling
};