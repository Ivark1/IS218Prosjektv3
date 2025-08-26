/**
 * Position module
 * Handles user geolocation and position markers
 */

import { findClosestMarker } from './layers.js';
import { calculateRoute, drawRoute } from './routing.js';

// Handle user geolocation success
function setupLocationTracking(map, positionLayer, shelterLayer, bunkerLayer, routeLayer, icons) {
    let positionMarker = null;

    function onLocationFound(e) {
        const radius = e.accuracy / 2;

        // Clear previous marker and circles
        if (positionMarker) {
            positionLayer.removeLayer(positionMarker);
        }
        positionLayer.eachLayer(layer => {
            if (layer instanceof L.Circle) {
                positionLayer.removeLayer(layer);
            }
        });

        // Add new position marker
        positionMarker = L.marker(e.latlng, { icon: icons.greenIcon }).addTo(positionLayer);

        // Find closest shelter with route
        const closestShelter = findClosestMarkerWithRoute(e.latlng, shelterLayer, routeLayer, 'blue');

        // Find closest bunker with route
        const closestBunker = findClosestMarkerWithRoute(e.latlng, bunkerLayer, routeLayer, 'red');

        // Info panel
        const radiusText = radius.toFixed(1);
        let infoContent = `<div style="margin-bottom: 10px;"><b>Din posisjon</b><br>Nøyaktighet: ${radiusText} meter</div>`;

        if (closestShelter.marker) {
            const d = closestShelter.distance;
            const distanceText = d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m';
            infoContent += `<div style="margin-bottom: 5px;"><b>Nærmeste Alternative Tilfluktsrom:</b> ${distanceText}</div>`;
        } else {
            infoContent += `<div style="margin-bottom: 10px;"><b>Ingen Alternative Tilfluktsrom funnet</b></div>`;
        }

        if (closestBunker.marker) {
            const d = closestBunker.distance;
            const distanceText = d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m';

            let bunkerDetails = '';
            if (closestBunker.marker._popup) {
                const div = document.createElement('div');
                div.innerHTML = closestBunker.marker._popup._content;
                bunkerDetails = div.textContent.trim().replace(/\n\s+/g, ', ');
            }

            infoContent += `<div style="margin-bottom: 5px;"><b>Nærmeste Tilfluktsrom:</b> ${distanceText}</div>`;
            if (bunkerDetails) {
                infoContent += `<div style="font-size: 0.9em; margin-bottom: 10px;">${bunkerDetails}</div>`;
            }
        } else {
            infoContent += `<div style="margin-bottom: 10px;"><b>Ingen Tilfluktsrom funnet</b></div>`;
        }

        updateInfoPanel(infoContent);

        // Accuracy circle
        L.circle(e.latlng, {
            radius: radius,
            color: 'green',
            fillColor: '#3f9',
            fillOpacity: 0.2
        }).addTo(positionLayer);

        // Center map on position
        map.setView(e.latlng, map.getZoom());
    }

    function onLocationError(e) {
        console.error("Geolocation error:", e);
        alert("Kunne ikke finne din posisjon: " + e.message);
    }

    function findClosestMarkerWithRoute(position, layerGroup, routeLayerGroup, routeColor) {
        const result = findClosestMarker(position, layerGroup);
        if (result.marker) {
            calculateRoute(position, result.marker.getLatLng())
                .then(geometry => {
                    // Clear previous routes of this color
                    routeLayerGroup.eachLayer(layer => {
                        if (layer.options && layer.options.style && layer.options.style.color === routeColor) {
                            routeLayerGroup.removeLayer(layer);
                        }
                    });
                    drawRoute(geometry, routeColor, routeLayerGroup);
                })
                .catch(error => console.error('Error calculating route:', error));
        }
        return result;
    }

    map.on('locationfound', onLocationFound);
    map.on('locationerror', onLocationError);

    return {
        locateUser: function () {
            map.locate({ setView: true, maxZoom: 16, enableHighAccuracy: true });
        }
    };
}

// Function to update the information panel
function updateInfoPanel(content) {
    const infoPanel = document.getElementById('position-info');
    if (infoPanel) {
        // Create a nicely formatted panel
        let formattedContent = `
            <div style="padding: 10px; background-color: #cce2e8; border-radius: 4px; margin-bottom: 10px;">

                ${content}
            </div>
        `;
    }
}

/**
 * ORS isochrone helpers — kept for optional use, but DISABLED by default.
 * These functions are no longer called for "valgt posisjon".
 */
async function fetchIsochronesFromORS(latlng, layer) {
    const apiKey = window.ENV && window.ENV.ORS_API_KEY;
    if (!apiKey) {
        console.error('ORS API key missing. Make sure you\'ve set window.ENV.ORS_API_KEY in your template.');
        return false;
    }

    const minutes = [5, 10, 15];
    const colors = { 5: '#e6c3ff', 10: '#b366ff', 15: '#9966cc' };

    try {
        const url = 'https://api.openrouteservice.org/v2/isochrones/foot-walking';
        const body = {
            locations: [[latlng.lng, latlng.lat]],
            range: minutes.map(m => m * 60),
            attributes: ['total_pop'],
            location_type: 'start',
            range_type: 'time'
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': apiKey,
                'Content-Type': 'application/json; charset=utf-8',
                'Accept': 'application/json, application/geo+json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const err = await response.json();
            console.error('ORS API Error:', err);
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        if (data.features && data.features.length > 0) {
            data.features.reverse().forEach(feature => {
                const mins = feature.properties.value / 60;
                const color = colors[mins] || colors[15];

                const polygon = L.geoJSON(feature, {
                    style: {
                        color,
                        weight: 2,
                        opacity: 0.7,
                        fillColor: color,
                        fillOpacity: 0.3,
                        className: 'custom-isochrone'
                    }
                }).addTo(layer);

                polygon.walkingTime = mins;
                polygon.on('click', function (e) {
                    updateInfoPanel(`<div style="margin-bottom: 5px;"><strong>Gåavstand:</strong> ${mins} minutter</div>`);
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

// Simple circle fallback (unused by default)
function createSimpleIsochrones(latlng, layer) {
    const colors = { 5: '#e6c3ff', 10: '#b366ff', 15: '#9966cc' };
    const walkingSpeeds = { 5: 250, 10: 500, 15: 750 };

    [5, 10, 15].forEach(minutes => {
        const radius = walkingSpeeds[minutes];
        const color = colors[minutes];
        const isochrone = L.circle(latlng, {
            radius,
            color,
            weight: 2,
            opacity: 0.7,
            fillColor: color,
            fillOpacity: 0.3,
            className: 'custom-isochrone'
        }).addTo(layer);

        isochrone.walkingTime = minutes;
        isochrone.on('click', function (e) {
            updateInfoPanel(`<div style="margin-bottom: 5px;"><strong>Gåavstand:</strong> ${minutes} minutter</div>`);
            L.DomEvent.stop(e);
        });
    });
}

/**
 * Custom marker (valgt posisjon)
 * By default, NO isochrones are generated here. Only distances + routes.
 * To re-enable, pass { enableIsochrones: true } as the last argument.
 */
function setupCustomMarker(map, customLayer, shelterLayer, bunkerLayer, routeLayer, icons, opts = {}) {
    const enableIsochrones = !!opts.enableIsochrones; // default false
    let customMarker = null;

    function createCustomMarker(latlng) {
        // Clear previous marker and any shapes in this layer
        if (customMarker) {
            customLayer.removeLayer(customMarker);
            customLayer.eachLayer(layer => {
                if (!(layer instanceof L.Marker)) customLayer.removeLayer(layer);
            });
        }

        // Add the violet marker
        customMarker = L.marker(latlng, { icon: icons.purpleIcon, draggable: true }).addTo(customLayer);

        // Nearest routes
        const closestShelter = findClosestMarkerWithRoute(latlng, shelterLayer, routeLayer, 'blue');
        const closestBunker  = findClosestMarkerWithRoute(latlng, bunkerLayer, routeLayer, 'red');

        // Do NOT make isochrones for selected position unless explicitly enabled
        if (enableIsochrones) {
            fetchIsochronesFromORS(latlng, customLayer).catch(err => {
                console.error('Error with ORS isochrones, falling back to circles:', err);
                createSimpleIsochrones(latlng, customLayer);
            });
        }

        // Info panel
        let infoContent = `<div style="margin-bottom: 10px;"><b>Din valgte posisjon</b></div>`;

        if (closestBunker.marker) {
            const d = closestBunker.distance;
            const distanceText = d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m';

            let bunkerDetails = '';
            if (closestBunker.marker._popup) {
                const div = document.createElement('div');
                div.innerHTML = closestBunker.marker._popup._content;
                bunkerDetails = div.textContent.trim().replace(/\n\s+/g, ', ');
            }

            infoContent += `<div style="margin-bottom: 5px;"><b>Nærmeste Tilfluktsrom:</b> ${distanceText}</div>`;
            if (bunkerDetails) {
                infoContent += `<div style="font-size: 0.9em; margin-bottom: 10px;">${bunkerDetails}</div>`;
            }
        } else {
            infoContent += `<div style="margin-bottom: 10px;"><b>Ingen Tilfluktsrom funnet</b></div>`;
        }

        if (closestShelter.marker) {
            const d = closestShelter.distance;
            const distanceText = d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m';
            infoContent += `<div><b>Nærmeste Alternative Tilfluktsrom:</b> ${distanceText}</div>`;
        } else {
            infoContent += `<div><b>Ingen Alternative Tilfluktsrom funnet</div>`;
        }

        updateInfoPanel(infoContent);

        // Recompute on drag
        customMarker.on('dragend', (event) => {
            const newPosition = event.target.getLatLng();
            createCustomMarker(newPosition);
        });
    }

    function findClosestMarkerWithRoute(position, layerGroup, routeLayerGroup, routeColor) {
        const result = findClosestMarker(position, layerGroup);
        if (result.marker) {
            calculateRoute(position, result.marker.getLatLng())
                .then(geometry => {
                    routeLayerGroup.eachLayer(layer => {
                        if (layer.options && layer.options.style && layer.options.style.color === routeColor) {
                            routeLayerGroup.removeLayer(layer);
                        }
                    });
                    drawRoute(geometry, routeColor, routeLayerGroup);
                })
                .catch(error => console.error('Error calculating route:', error));
        }
        return result;
    }

    // Place custom marker on map clicks (but no isochrones)
    map.on('click', (e) => {
        createCustomMarker(e.latlng);
    });

    return {
        clearCustomMarker: function () {
            if (customMarker) {
                customLayer.clearLayers();
                customMarker = null;
                const infoPanel = document.getElementById('position-info');
                if (infoPanel) {
                    infoPanel.innerHTML = 'Klikk på kartet for å velge en posisjon og se informasjon her.';
                }
            }
        }
    };
}

// Make updateInfoPanel available globally
window.updateInfoPanel = updateInfoPanel;

export { setupLocationTracking, setupCustomMarker, fetchIsochronesFromORS, createSimpleIsochrones, updateInfoPanel };
