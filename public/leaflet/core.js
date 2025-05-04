document.addEventListener('DOMContentLoaded', function () {
    try {
        // Sjekker om Proj4js er lastet - Proj4js library blir hentet i index.pug
        if (typeof proj4 === 'undefined') {
            console.error('Proj4js library not loaded! Please add the script tag in your HTML.');
            return;
        }

        // Definerer projeksjonen for Norge - UTM Sone 32N (EPSG:25832)
        proj4.defs('EPSG:25832', '+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');

        L.Icon.Default.imagePath = 'https://unpkg.com/leaflet@1.9.4/dist/images/';
        const map = L.map('map').setView([58.163576619299235, 8.003306530291821], 13);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }).addTo(map);

        // Define custom icons with absolute paths and improved settings
        const bombShelterIcon = L.icon({
            iconUrl: window.location.origin + '/assets/bunker-svgrepo-com-3.svg',
            iconSize: [30, 30],
            iconAnchor: [20, 20],
            popupAnchor: [0, -20]
        });

        const shelterIcon = L.icon({
            iconUrl: window.location.origin + '/assets/tent-7-svgrepo-com.svg',
            iconSize: [30, 30],
            iconAnchor: [20, 20],
            popupAnchor: [0, -20]
        });

        // Create layer groups to hold our markers
        const shelterLayer = L.layerGroup().addTo(map);
        const bunkerLayer = L.layerGroup().addTo(map);
        const positionLayer = L.layerGroup().addTo(map);
        const customLayer = L.layerGroup().addTo(map);
        const routeLayer = L.layerGroup().addTo(map);

        // Fallback icons in case SVGs fail to load
        const fallbackShelterIcon = L.icon({
            iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
            shadowSize: [41, 41],
            shadowAnchor: [12, 41]
        });

        const fallbackBunkerIcon = L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
            shadowSize: [41, 41],
            shadowAnchor: [12, 41]
        });

        // Function to preload SVG icons and check if they load properly
        function preloadImages(urls, callback) {
            let loadedCount = 0;
            const results = {};

            urls.forEach(url => {
                const img = new Image();
                img.onload = function() {
                    results[url] = true;
                    loadedCount++;
                    if (loadedCount === urls.length) callback(results);
                };
                img.onerror = function() {
                    results[url] = false;
                    loadedCount++;
                    if (loadedCount === urls.length) callback(results);
                };
                img.src = url;
            });
        }

        // Check if SVGs can be loaded
        const shelterIconUrl = window.location.origin + '/assets/tent-7-svgrepo-com.svg';
        const bunkerIconUrl = window.location.origin + '/assets/bunker-svgrepo-com-3.svg';

        preloadImages([shelterIconUrl, bunkerIconUrl], function(results) {
            const useShelterSvg = results[shelterIconUrl];
            const useBunkerSvg = results[bunkerIconUrl];

            // Add shelter points (blue markers - default)
            if (window.shelterData && window.shelterData.length > 0) {
                window.shelterData.forEach(point => {
                    if (point.geom && point.geom.coordinates) {
                        const coordinates = point.geom.coordinates;
                        // Use SVG if it loaded, otherwise fallback
                        const icon = useShelterSvg ? shelterIcon : fallbackShelterIcon;
                        L.marker([coordinates[1], coordinates[0]], { icon: icon })
                            .addTo(shelterLayer)
                            .bindPopup('Alternativt Tilfluktsrom');
                    }
                });
            }

            // Add bunker points (red markers)
            if (window.bunkerData && window.bunkerData.length > 0) {
                window.bunkerData.forEach((point, index) => {
                    if (point.geom && point.geom.coordinates) {
                        try {
                            const utmEasting = point.geom.coordinates[0];
                            const utmNorthing = point.geom.coordinates[1];
                            // Konverterer fra UTM Sone 32N til WGS84
                            const wgs84Coords = proj4('EPSG:25832', 'WGS84', [utmEasting, utmNorthing]);
                            const lat = wgs84Coords[1];
                            const lng = wgs84Coords[0];

                            // Use SVG if it loaded, otherwise fallback
                            const icon = useBunkerSvg ? bombShelterIcon : fallbackBunkerIcon;
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
        });

        // Add current position marker (green)
        let positionMarker = null;
        let customMarker = null;
        let infoBox = null;

        const greenIcon = L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            shadowSize: [41, 41],
            shadowAnchor: [12, 41]
        });

        const purpleIcon = L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-violet.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            shadowSize: [41, 41],
            shadowAnchor: [12, 41]
        });

        // Helper function to calculate distance between two points in meters
        function calculateDistance(latlng1, latlng2) {
            return latlng1.distanceTo(latlng2);
        }

        // Function to find closest marker from a layer group
        function findClosestMarker(position, layerGroup) {
            let closestMarker = null;
            let closestDistance = 50000;

            layerGroup.eachLayer(function (layer) {
                if (layer instanceof L.Marker) {
                    const distance = calculateDistance(position, layer.getLatLng());
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

        // OSRM Automatic Route Generation
        // Function to calculate route between two points using OSRM
        function calculateRoute(startPoint, endPoint) {
            // OSRM public demo server - for production, consider using your own OSRM instance
            const osrmURL = `https://router.project-osrm.org/route/v1/walking/${startPoint.lng},${startPoint.lat};${endPoint.lng},${endPoint.lat}?overview=full&geometries=geojson`;

            return fetch(osrmURL)
                .then(response => response.json())
                .then(data => {
                    if (data.code !== 'Ok') {
                        throw new Error(`OSRM returned an error: ${data.code}`);
                    }

                    return data.routes[0].geometry;
                });
        }

        // Function to draw route on the map
        function drawRoute(geometry, color = '#3388ff', layerGroup) {
            const route = L.geoJSON(geometry, {
                style: {
                    color: color,
                    weight: 4,
                    opacity: 0.6
                }
            }).addTo(layerGroup);

            return route;
        }

        // Function to find closest marker and calculate route
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

        // Function to handle geolocation success
        function onLocationFound(e) {
            const radius = e.accuracy / 2;

            // Clear previous marker if exists
            if (positionMarker) {
                positionLayer.removeLayer(positionMarker);
            }

            // Clear previous accuracy circles
            positionLayer.eachLayer(layer => {
                if (layer instanceof L.Circle) {
                    positionLayer.removeLayer(layer);
                }
            });

            // Add new position marker
            positionMarker = L.marker(e.latlng, {
                icon: greenIcon
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

        // Set up location tracking
        map.on('locationfound', onLocationFound);
        map.on('locationerror', onLocationError);

        // Function to create custom marker and calculate distances
        function createCustomMarker(latlng) {
            // Clear previous custom marker if exists
            if (customMarker) {
                customLayer.removeLayer(customMarker);

                // Also clear all lines and distance indicators
                customLayer.eachLayer(layer => {
                    if (!(layer instanceof L.Marker)) {
                        customLayer.removeLayer(layer);
                    }
                });
            }

            // Add new custom marker
            customMarker = L.marker(latlng, {
                icon: purpleIcon,
                draggable: true // Make the marker draggable
            }).addTo(customLayer);

            // Find closest shelter with route
            let closestShelter = findClosestMarkerWithRoute(latlng, shelterLayer, routeLayer, 'blue');

            // Find closest bunker with route
            let closestBunker = findClosestMarkerWithRoute(latlng, bunkerLayer, routeLayer, 'red');

            // Create information popup
            let popupContent = `<b>Din valgte posisjon</b><br><br>`;

            let distanceUnitBunker = 'm';
            let distanceUnitShelter = 'm';

            if (closestBunker.distance >= 1000) {
                distanceBunker = (closestBunker.distance / 1000).toFixed(1);
                distanceUnitBunker = 'km';
            }
            else {
                distanceBunker = Math.round(closestBunker.distance);                
            }

            if (closestShelter.distance >= 1000) {
                distanceShelter = (closestShelter.distance / 1000).toFixed(1);
                distanceUnitShelter = 'km';
            }
            else {
                distanceShelter = Math.round(closestShelter.distance);                
            }

            if (closestShelter.marker) {
                popupContent += `<b>Nærmeste Alternative Tilfluktsrom:</b> ${distanceShelter} ${distanceUnitShelter}<br>`;
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

                popupContent += `<b>Nærmeste Tilfluktsrom:</b> ${distanceBunker} ${distanceUnitBunker}`;
                if (bunkerDetails) {
                    popupContent += `<br><small>${bunkerDetails}</small>`;
                }
            } else {
                popupContent += `<b>Ingen Tilfluktsrom funnet</b>`;
            }

            customMarker.bindPopup(popupContent).openPopup();

            // Update distances and routes when marker is dragged
            customMarker.on('dragend', function (event) {
                const newPosition = event.target.getLatLng();
                createCustomMarker(newPosition);
            });
        }

        // Enable map click to place custom marker
        map.on('click', function (e) {
            createCustomMarker(e.latlng);
        });

        // Create a locate control button
        const locateControl = L.control({ position: 'bottomright' });

        locateControl.onAdd = function (map) {
            const div = L.DomUtil.create('div', 'locate-control');
            div.innerHTML = `
              <div style="display: flex; flex-direction: column; gap: 10px;">
                <button id="locate-button" style="padding: 10px; background: white; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; display: flex; align-items: center;">
                  <img src="/assets/map-pin-svgrepo-com.svg" alt="Pin" style="width: 20px; height: 20px; margin-right: 8px; vertical-align: middle;">
                  <span style="font-size: 16px; line-height: 20px;">Finn min posisjon</span>
                </button>
              </div>
            `;
        
            // Prevent map clicks from propagating through the control
            L.DomEvent.disableClickPropagation(div);
        
            return div;
        };

        locateControl.addTo(map);

        // Setup layer control checkboxes
        setTimeout(() => {
            // Setup event listeners for checkboxes that are now in the button-container
            document.getElementByid('shelter-checkbox').addEventListener('change', function (e) {
                if (e.target.checked) {
                    map.addLayer(shelterLayer);
                } else {
                    map.removeLayer(shelterLayer);
                }
            });

            document.getElementByid('bunker-checkbox').addEventListener('change', function (e) {
                if (e.target.checked) {
                    map.addLayer(bunkerLayer);
                } else {
                    map.removeLayer(bunkerLayer);
                }
            });

            document.getElementByid('position-checkbox').addEventListener('change', function (e) {
                if (e.target.checked) {
                    map.addLayer(positionLayer);
                } else {
                    map.removeLayer(positionLayer);
                }
            });

            document.getElementByid('custom-checkbox').addEventListener('change', function (e) {
                if (e.target.checked) {
                    map.addLayer(customLayer);
                } else {
                    map.removeLayer(customLayer);
                }
            });

            // Add event listener for route checkbox
            document.getElementByid('route-checkbox').addEventListener('change', function (e) {
                if (e.target.checked) {
                    map.addLayer(routeLayer);
                    // If the info box exists, show it when routes are enabled
                    if (infoBox) {
                        document.querySelector('.info-box').style.display = 'block';
                    }
                } else {
                    map.removeLayer(routeLayer);
                    // Hide the info box when routes are disabled
                    if (infoBox) {
                        document.querySelector('.info-box').style.display = 'none';
                    }
                }
            });

            // Add event listener for locate button
            document.getElementByid('locate-button').addEventListener('click', function () {
                map.locate({
                    setView: true,
                    maxZoom: 16,
                    enableHighAccuracy: true
                });
            });

            // Add event listener for clear custom marker button
            document.getElementByid('clear-custom-button').addEventListener('click', function () {
                if (customMarker) {
                    customLayer.clearLayers();
                    customMarker = null;

                    // Update the info box to show that no custom marker is selected
                    if (typeof createOrUpdateInfoBox === "function") {
                        createOrUpdateInfoBox({
                            shelter: { marker: null, distance: Infinity },
                            bunker: { marker: null, distance: Infinity },
                            overall: null,
                            type: ''
                        }, null);
                    }
                }
            });
        }, 200);

        // Ensure map renders correctly
        setTimeout(() => {
            map.invalidateSize();
        }, 100);

        // Log success message
        console.log('Map initialized successfully');

    } catch (error) {
        console.error('Map initialization error:', error);
    }
    
    // 📦 Sidebar toggle-knapp med ikonbytte
    const toggleButton = document.querySelector('.menu-toggle');
    const sidebar = document.getElementById('sidebar');

    if (toggleButton && sidebar) {
        toggleButton.addEventListener('click', () => {
            sidebar.classList.toggle('closed');
            toggleButton.textContent = sidebar.classList.contains('closed') ? '➤' : '☰';
        });

        // Sett korrekt ikon ved lasting
        toggleButton.textContent = sidebar.classList.contains('closed') ? '➤' : '☰';
    }
});