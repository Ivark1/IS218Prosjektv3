/**
 * Position module
 * Handles user geolocation and position markers
 */

import { findClosestMarker } from './layers.js';
import { calculateRoute, drawRoute } from './routing.js';

// Handle user geolocation success
function setupLocationTracking(map, positionLayer, shelterLayer, bunkerLayer, routeLayer, icons) {
    // Your existing setupLocationTracking function code
    // No changes needed here
}

// Function to update the information panel
function updateInfoPanel(content) {
    const infoPanel = document.getElementById('position-info');
    if (infoPanel) {
        // Create a nicely formatted panel
        let formattedContent = `
            <div style="padding: 10px; background-color: white; border-radius: 4px; margin-bottom: 10px;">
                ${content}
            </div>
        `;
        infoPanel.innerHTML = formattedContent;
    }
}

// Function to fetch isochrones from OpenRouteService
async function fetchIsochronesFromORS(latlng, layer) {
    const apiKey = 'DIN API NØKKEL'; // Replace with your actual key
    const minutes = [5, 10, 15]; // The time ranges we want
    
    // Define colors for different time ranges
    const colors = {
        5: '#e6c3ff',  // Light purple for 5 minutes
        10: '#b366ff', // Medium purple for 10 minutes
        15: '#9966cc'  // Dark purple for 15 minutes
    };
    
    try {
        // The ORS API endpoint for isochrones
        const url = 'https://api.openrouteservice.org/v2/isochrones/foot-walking';
        
        // Prepare the request body
        const requestBody = {
            locations: [[latlng.lng, latlng.lat]],
            range: minutes.map(min => min * 60), // Convert minutes to seconds
            attributes: ['total_pop'], // Optional, if available
            location_type: 'start',
            range_type: 'time'
        };
        
        // Make the API request
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': apiKey,
                'Content-Type': 'application/json; charset=utf-8',
                'Accept': 'application/json, application/geo+json'
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            console.error('ORS API Error:', errorData);
            throw new Error(`API error: ${response.status}`);
        }
        
        // Process the response
        const data = await response.json();
        
        // Add isochrones to the map
        if (data.features && data.features.length > 0) {
            // ORS returns features in reverse order (largest first)
            data.features.reverse().forEach((feature, idx) => {
                const minutes = feature.properties.value / 60; // Convert seconds back to minutes
                const color = colors[minutes] || colors[15];
                
                // Create the isochrone polygon
                const polygon = L.geoJSON(feature, {
                    style: {
                        color: color,
                        weight: 2,
                        opacity: 0.7,
                        fillColor: color,
                        fillOpacity: 0.3,
                        className: 'custom-isochrone'
                    }
                }).addTo(layer);
                
                // Store walking time as property instead of binding a popup
                polygon.walkingTime = minutes;
                
                // Add custom click handler for the isochrone
                polygon.on('click', function(e) {
                    // Update the info panel with walking time
                    const infoContent = `<div style="margin-bottom: 5px;"><strong>Gåavstand:</strong> ${minutes} minutter</div>`;
                    updateInfoPanel(infoContent);
                    
                    // Prevent the click from propagating to the map
                    L.DomEvent.stop(e);
                });
            });
            
            return true;
        } else {
            console.warn('No isochrone features returned from API');
            return false;
        }
    } catch (error) {
        console.error('Error fetching isochrones:', error);
        return false;
    }
}

// Simple circle-based isochrones as a fallback
function createSimpleIsochrones(latlng, layer) {
    // Define colors for different time ranges
    const colors = {
        5: '#e6c3ff',  // Light purple for 5 minutes
        10: '#b366ff', // Medium purple for 10 minutes
        15: '#9966cc'  // Dark purple for 15 minutes
    };
    
    // Approximate walking distances
    const walkingMinutes = [5, 10, 15];
    const walkingSpeeds = {
        5: 250,  // meters in 5 minutes
        10: 500, // meters in 10 minutes
        15: 750  // meters in 15 minutes
    };
    
    // Create isochrones as circles with different radii
    walkingMinutes.forEach(minutes => {
        const radius = walkingSpeeds[minutes];
        const color = colors[minutes];
        
        // Create a circle to represent the isochrone
        const isochrone = L.circle(latlng, {
            radius: radius,
            color: color,
            weight: 2,
            opacity: 0.7,
            fillColor: color,
            fillOpacity: 0.3,
            className: 'custom-isochrone'
        }).addTo(layer);
        
        // Store walking time as property
        isochrone.walkingTime = minutes;
        
        // Add custom click handler for the isochrone
        isochrone.on('click', function(e) {
            // Update the info panel with walking time
            const infoContent = `<div style="margin-bottom: 5px;"><strong>Gåavstand:</strong> ${minutes} minutter</div>`;
            updateInfoPanel(infoContent);
            
            // Prevent the click from propagating to the map
            L.DomEvent.stop(e);
        });
    });
}

// Handle custom marker placement
function setupCustomMarker(map, customLayer, shelterLayer, bunkerLayer, routeLayer, icons) {
    let customMarker = null;

    // Function to create custom marker and calculate distances
    function createCustomMarker(latlng) {
        // Clear previous custom marker and related elements
        if (customMarker) {
            customLayer.removeLayer(customMarker);
            customLayer.eachLayer(layer => {
                if (!(layer instanceof L.Marker)) {
                    customLayer.removeLayer(layer);
                }
            });
        }

        // Add new custom marker
        customMarker = L.marker(latlng, {
            icon: icons.purpleIcon,
            draggable: true
        }).addTo(customLayer);

        // Find closest shelter with route
        const closestShelter = findClosestMarkerWithRoute(latlng, shelterLayer, routeLayer, 'blue');

        // Find closest bunker with route
        const closestBunker = findClosestMarkerWithRoute(latlng, bunkerLayer, routeLayer, 'red');
        
        // Try to fetch isochrones from OpenRouteService
        fetchIsochronesFromORS(latlng, customLayer).catch(error => {
            console.error('Error with ORS isochrones, falling back to circles:', error);
            // Fall back to simple circles if the API fails
            createSimpleIsochrones(latlng, customLayer);
        });

        // Format distance display
        let infoContent = `<div style="margin-bottom: 10px;"><b>Din valgte posisjon</b></div>`;
        let distanceUnitBunker = 'm';
        let distanceUnitShelter = 'm';
        let distanceBunker, distanceShelter;

        if (closestBunker.distance >= 1000) {
            distanceBunker = (closestBunker.distance / 1000).toFixed(1);
            distanceUnitBunker = 'km';
        } else {
            distanceBunker = Math.round(closestBunker.distance);
        }

        if (closestShelter.distance >= 1000) {
            distanceShelter = (closestShelter.distance / 1000).toFixed(1);
            distanceUnitShelter = 'km';
        } else {
            distanceShelter = Math.round(closestShelter.distance);
        }

        // Build info content
        if (closestBunker.marker) {
            let bunkerDetails = '';
            if (closestBunker.marker._popup) {
                const popupElement = document.createElement('div');
                popupElement.innerHTML = closestBunker.marker._popup._content;
                bunkerDetails = popupElement.textContent.trim().replace(/\n\s+/g, ', ');
            }

            infoContent += `<div style="margin-bottom: 5px;"><b>Nærmeste Tilfluktsrom:</b> ${distanceBunker} ${distanceUnitBunker}</div>`;
            if (bunkerDetails) {
                infoContent += `<div style="font-size: 0.9em; margin-bottom: 10px;">${bunkerDetails}</div>`;
            }
        } else {
            infoContent += `<div style="margin-bottom: 10px;"><b>Ingen Tilfluktsrom funnet</b></div>`;
        }

        if (closestShelter.marker) {
            infoContent += `<div><b>Nærmeste Alternative Tilfluktsrom:</b> ${distanceShelter} ${distanceUnitShelter}</div>`;
        } else {
            infoContent += `<div><b>Ingen Alternative Tilfluktsrom funnet</b></div>`;
        }

        // Update info panel instead of showing popup
        updateInfoPanel(infoContent);

        // Update distances and routes when marker is dragged
        customMarker.on('dragend', function (event) {
            const newPosition = event.target.getLatLng();
            createCustomMarker(newPosition);
        });
    }

    // Find closest marker and calculate route
    function findClosestMarkerWithRoute(position, layerGroup, routeLayerGroup, routeColor) {
        // First find the closest marker
        const result = findClosestMarker(position, layerGroup);

        // Then calculate route if a marker was found
        if (result.marker) {
            calculateRoute(position, result.marker.getLatLng())
                .then(geometry => {
                    // Clear previous routes of this color
                    routeLayerGroup.eachLayer(layer => {
                        if (layer.options && layer.options.style && layer.options.style.color === routeColor) {
                            routeLayerGroup.removeLayer(layer);
                        }
                    });

                    // Draw the new route
                    drawRoute(geometry, routeColor, routeLayerGroup);
                })
                .catch(error => {
                    console.error('Error calculating route:', error);
                });
        }

        return result;
    }

    // Setup map click event to place custom marker
    map.on('click', function (e) {
        createCustomMarker(e.latlng);
    });

    return {
        clearCustomMarker: function () {
            if (customMarker) {
                customLayer.clearLayers();
                customMarker = null;
                
                // Clear the info panel
                const infoPanel = document.getElementById('position-info');
                if (infoPanel) {
                    infoPanel.innerHTML = 'Klikk på kartet for å velge en posisjon og se informasjon her.';
                }
            }
        }
    };
}

export { setupLocationTracking, setupCustomMarker, fetchIsochronesFromORS, createSimpleIsochrones, updateInfoPanel };