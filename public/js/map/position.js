/**
 * Position module
 * Handles user geolocation and position markers
 */

import { findClosestMarker } from './layers.js';
import { calculateRoute, drawRoute } from './routing.js';

// Handle user geolocation success
function setupLocationTracking(map, positionLayer, shelterLayer, bunkerLayer, routeLayer, icons) {
    let positionMarker = null;

    // Function to handle geolocation success
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
        positionMarker = L.marker(e.latlng, {
            icon: icons.greenIcon
        }).addTo(positionLayer);

        // Find closest shelter with route
        const closestShelter = findClosestMarkerWithRoute(e.latlng, shelterLayer, routeLayer, 'blue');

        // Find closest bunker with route
        const closestBunker = findClosestMarkerWithRoute(e.latlng, bunkerLayer, routeLayer, 'red');

        // Create information popup
        let popupContent = `<b>Din posisjon</b><br>Nøyaktighet: ${radius.toFixed(1)} meter<br><br>`;

        if (closestShelter.marker) {
            popupContent += `<b>Nærmeste Alternative Tilfluktsrom:</b> ${Math.round(closestShelter.distance)} meter<br>`;
        } else {
            popupContent += `<b>Ingen Alternative Tilfluktsrom funnet</b><br>`;
        }

        if (closestBunker.marker) {
            // Get the bunker details from the popup content
            let bunkerDetails = '';
            if (closestBunker.marker._popup) {
                const popupElement = document.createElement('div');
                popupElement.innerHTML = closestBunker.marker._popup._content;
                bunkerDetails = popupElement.textContent.trim().replace(/\n\s+/g, ', ');
            }

            popupContent += `<b>Nærmeste Tilfluktsrom:</b> ${Math.round(closestBunker.distance)} meter`;
            if (bunkerDetails) {
                popupContent += `<br><small>${bunkerDetails}</small>`;
            }
        } else {
            popupContent += `<b>Ingen Tilfluktsrom funnet</b>`;
        }

        positionMarker.bindPopup(popupContent).openPopup();

        // Add accuracy circle
        L.circle(e.latlng, {
            radius: radius,
            color: 'green',
            fillColor: '#3f9',
            fillOpacity: 0.2
        }).addTo(positionLayer);

        // Center map on position
        map.setView(e.latlng, map.getZoom());
    }

    // Function to handle geolocation errors
    function onLocationError(e) {
        alert("Kunne ikke finne din posisjon: " + e.message);
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

    // Set up event listeners
    map.on('locationfound', onLocationFound);
    map.on('locationerror', onLocationError);

    return {
        locateUser: function () {
            map.locate({
                setView: true,
                maxZoom: 16,
                enableHighAccuracy: true
            });
        }
    };
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

        // Format distance display
        let popupContent = `<b>Din valgte posisjon</b><br><br>`;
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

        // Build popup content
        popupContent = '';

        if (closestBunker.marker) {
            let bunkerDetails = '';
            if (closestBunker.marker._popup) {
                const popupElement = document.createElement('div');
                popupElement.innerHTML = closestBunker.marker._popup._content;
                bunkerDetails = popupElement.textContent.trim().replace(/\n\s+/g, ', ');
            }

            popupContent += `<b>Nærmeste Tilfluktsrom:</b> ${distanceBunker} ${distanceUnitBunker}`;
            if (bunkerDetails) {
                popupContent += `<br><small>${bunkerDetails}</small>`;
            }
            popupContent += `<br>`;
        } else {
            popupContent += `<b>Ingen Tilfluktsrom funnet</b><br>`;
        }

        if (closestShelter.marker) {
            popupContent += `<b>Nærmeste Alternative Tilfluktsrom:</b> ${distanceShelter} ${distanceUnitShelter}<br>`;
        } else {
            popupContent += `<b>Ingen Alternative Tilfluktsrom funnet</b><br>`;
        }

        customMarker.bindPopup(popupContent).openPopup();

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
            }
        }
    };
}

export { setupLocationTracking, setupCustomMarker };