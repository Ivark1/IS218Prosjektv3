/**
 * Drawing and Analysis module
 * Handles shape drawing and population/capacity analysis
 */

import { convertUTMToWGS84 } from './config.js';

// Initialize drawing controls
function initializeDrawing(map) {
    console.log('Population data available:', !!window.populationData);
    if (window.populationData) {
        console.log('Population records:', window.populationData.length);
        if (window.populationData.length > 0) {
            console.log('First record sample:', window.populationData[0]);
        }
    }
    
    // Create a feature group to store drawn items
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    // Set up draw control options
    const drawControl = new L.Control.Draw({
        position: 'topright',
        draw: {
            polyline: false,
            marker: false,
            circlemarker: false,
            polygon: {
                allowIntersection: false,
                showArea: true
            },
            rectangle: true,
            circle: true
        },
        edit: {
            featureGroup: drawnItems,
            remove: true
        }
    });
    
    map.addControl(drawControl);

    // Create population layer
    const populationLayer = L.layerGroup();
    
    // Load population data if available
    if (window.populationData && window.populationData.length) {
        loadPopulationData(window.populationData, populationLayer);
    }

    // Variable to store the current drawn shape
    let currentDrawnShape = null;

    // Event handler for when a shape is created
    map.on(L.Draw.Event.CREATED, function(event) {
        const layer = event.layer;
        
        // Remove previous shapes when a new one is drawn
        drawnItems.clearLayers();
        currentDrawnShape = layer;
        
        // Add the new layer
        drawnItems.addLayer(layer);
        
        // Perform analysis with the new shape
        if (window.populationData && window.bunkerData) {
            performAnalysis(layer, window.populationData, window.bunkerData, window.shelterData);
        }
    });

    // Event handler for when a shape is edited
    map.on(L.Draw.Event.EDITED, function(event) {
        const layers = event.layers;
        
        layers.eachLayer(function(layer) {
            currentDrawnShape = layer;
            
            // Perform analysis with the edited shape
            if (window.populationData && window.bunkerData) {
                performAnalysis(layer, window.populationData, window.bunkerData, window.shelterData);
            }
        });
    });

    // Event handler for when a shape is deleted
    map.on(L.Draw.Event.DELETED, function(event) {
        currentDrawnShape = null;
        clearAnalysisResults();
    });

    // Add event listener for clear analysis button
    document.getElementById('clear-analysis').addEventListener('click', function() {
        drawnItems.clearLayers();
        currentDrawnShape = null;
        clearAnalysisResults();
    });

    // Toggle population layer visibility based on checkbox
    document.getElementById('population-checkbox').addEventListener('change', function(e) {
        if (e.target.checked) {
            map.addLayer(populationLayer);
        } else {
            map.removeLayer(populationLayer);
        }
    });

    // Initially add the population layer if checkbox is checked
    if (document.getElementById('population-checkbox').checked) {
        map.addLayer(populationLayer);
    }

    return {
        drawnItems,
        populationLayer
    };
}

// Load and display population data on the map
function loadPopulationData(populationData, populationLayer) {
    console.log('Population data to load:', populationData?.length);
    
    if (!populationData || !populationData.length) {
        console.error('No population data available');
        return;
    }
    
    // Debug the first item to see its structure
    if (populationData[0]) {
        console.log('First population item:', populationData[0]);
        console.log('Geometry type:', populationData[0].geom ? 
            (typeof populationData[0].geom === 'string' ? 'string' : 
            (populationData[0].geom.coordinates ? 'GeoJSON' : 'other')) : 'missing');
        
        // Sample one population area's coordinates to understand format
        if (populationData[0].geom && populationData[0].geom.coordinates) {
            const sampleCoords = populationData[0].geom.coordinates[0] || populationData[0].geom.coordinates;
            if (sampleCoords && sampleCoords.length > 0) {
                console.log('Sample coordinate:', sampleCoords[0]);
                console.log('Appears to be UTM coordinates:', sampleCoords[0][0] > 180 || sampleCoords[0][1] > 90);
            }
        }
    }
    
    let successCount = 0;
    let errorCount = 0;
    
    populationData.forEach((area, index) => {
        try {
            // Skip if no geometry or population data
            if (!area.geom || !area.poptot) {
                return;
            }
            
            // If geom is already in GeoJSON format with coordinates
            if (area.geom.coordinates && Array.isArray(area.geom.coordinates)) {
                // Create polygon from coordinates
                const polygonCoords = [];
                
                // Handle polygon coordinate structure
                // This assumes MultiPolygon format - adjust as needed
                const coords = area.geom.coordinates[0] || area.geom.coordinates;
                
                if (!coords || !Array.isArray(coords)) {
                    console.warn(`Invalid coordinates for area ${index}`);
                    errorCount++;
                    return;
                }
                
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
                            polygonCoords.push([coord[1], coord[0]]); // Already WGS84
                        }
                    } catch (err) {
                        console.warn(`Error converting coordinate in area ${index}:`, err);
                    }
                });
                
                if (polygonCoords.length < 3) {
                    console.warn(`Not enough valid coordinates for area ${index}`);
                    errorCount++;
                    return;
                }
                
                // Create polygon and add to layer
                const polygon = L.polygon(polygonCoords, {
                    color: '#666',
                    weight: 1,
                    opacity: 0.7,
                    fillColor: getColorByPopulation(area.poptot),
                    fillOpacity: 0.4
                }).addTo(populationLayer);
                
                // Add popup
                polygon.bindPopup(`<strong>Befolkning:</strong> ${area.poptot} personer`);
                
                successCount++;
            } else {
                console.warn(`Area ${index} has invalid geometry format`);
                errorCount++;
            }
        } catch (error) {
            console.error(`Error processing population area ${index}:`, error);
            errorCount++;
        }
    });
    
    console.log(`Population loading complete. Success: ${successCount}, Errors: ${errorCount}`);
}

// Helper function to determine color based on population
function getColorByPopulation(population) {
    if (population > 2000) return '#BD0026'; // Very high density
    if (population > 1000) return '#FC4E2A'; // High density
    if (population > 500) return '#FD8D3C';  // Medium density
    if (population > 100) return '#FEB24C';  // Low-medium density
    return '#FFEDA0'; // Low density
}

// Perform analysis with the drawn shape
function performAnalysis(drawnShape, populationData, bunkerData, shelterData) {
    console.log('Starting analysis with drawn shape');
    
    // Get the bounds or center of the drawn shape depending on its type
    let shapeType, shapeBounds, shapeCenter, shapeRadius;
    
    if (drawnShape instanceof L.Circle) {
        shapeType = 'circle';
        shapeCenter = drawnShape.getLatLng();
        shapeRadius = drawnShape.getRadius();
        shapeBounds = drawnShape.getBounds();
        console.log(`Circle analysis - center: ${shapeCenter}, radius: ${shapeRadius}m`);
    } else {
        // For polygons and rectangles
        shapeType = drawnShape instanceof L.Rectangle ? 'rectangle' : 'polygon';
        shapeBounds = drawnShape.getBounds();
        console.log(`${shapeType} analysis - bounds: ${JSON.stringify(shapeBounds)}`);
    }
    
    // Calculate total population within the shape
    let totalPopulation = 0;
    let areasIntersected = 0;
    let areasProcessed = 0;
    let areasWithErrors = 0;
    
    if (!populationData || !populationData.length) {
        console.warn('No population data available for analysis');
    } else {
        console.log(`Analyzing ${populationData.length} population areas`);
        
        populationData.forEach((area, index) => {
            areasProcessed++;
            
            if (!area.geom || !area.geom.coordinates || !area.poptot) {
                return; // Skip if missing needed data
            }
            
            try {
                // Get coordinates in the right format for analysis
                const coords = area.geom.coordinates[0] || area.geom.coordinates;
                
                if (!coords || !Array.isArray(coords)) {
                    return; // Skip if invalid coordinates
                }
                
                // Convert UTM coordinates to WGS84 if needed
                const convertedCoords = coords.map(coord => {
                    try {
                        // Check if UTM conversion is needed
                        if (coord[0] > 180 || coord[1] > 90) { // Likely UTM coordinates
                            const wgs84 = convertUTMToWGS84(coord[0], coord[1]);
                            return [wgs84[1], wgs84[0]]; // [lat, lng] for Leaflet
                        } else {
                            return [coord[1], coord[0]]; // Already WGS84
                        }
                    } catch (err) {
                        console.warn(`Error converting coordinate: ${err.message}`);
                        return null;
                    }
                }).filter(coord => coord !== null);
                
                if (convertedCoords.length < 3) {
                    return; // Need at least 3 points for a polygon
                }
                
                // Create polygon for intersection testing
                const polygon = L.polygon(convertedCoords);
                const polygonBounds = polygon.getBounds();
                
                // Check if area intersects with the drawn shape
                let isIntersecting = false;
                
                if (shapeType === 'circle') {
                    // For circles, check if any point is within radius or if bounds intersect
                    if (polygonBounds.intersects(shapeBounds)) {
                        // More detailed check - see if any vertex is in the circle
                        for (const coord of convertedCoords) {
                            const point = L.latLng(coord[0], coord[1]);
                            if (point.distanceTo(shapeCenter) <= shapeRadius) {
                                isIntersecting = true;
                                break;
                            }
                        }
                    }
                } else {
                    // For rectangles and polygons, check if bounds intersect
                    isIntersecting = polygonBounds.intersects(shapeBounds);
                }
                
                if (isIntersecting) {
                    areasIntersected++;
                    totalPopulation += area.poptot;
                    console.log(`Area ${index} intersects with shape. Population: ${area.poptot}. Running total: ${totalPopulation}`);
                }
            } catch (error) {
                areasWithErrors++;
                console.error(`Error analyzing population area ${index}:`, error);
            }
        });
    }
    
    console.log(`Population analysis complete. Total areas processed: ${areasProcessed}, areas intersected: ${areasIntersected}, areas with errors: ${areasWithErrors}`);
    console.log(`Total population in drawn shape: ${totalPopulation}`);
    
    // Calculate total shelter capacity within the shape
    let totalShelterCapacity = 0;
    let bunkersInside = 0;
    
    // Count bunker capacity
    if (!bunkerData || !bunkerData.length) {
        console.warn('No bunker data available for analysis');
    } else {
        console.log(`Analyzing ${bunkerData.length} bunkers`);
        
        bunkerData.forEach((bunker, index) => {
            if (!bunker.geom || !bunker.geom.coordinates || !bunker.plasser) {
                return;
            }
            
            try {
                const utmEasting = bunker.geom.coordinates[0];
                const utmNorthing = bunker.geom.coordinates[1];
                
                // Convert coordinates
                const wgs84Coords = convertUTMToWGS84(utmEasting, utmNorthing);
                const lat = wgs84Coords[1];
                const lng = wgs84Coords[0];
                const bunkerLatLng = L.latLng(lat, lng);
                
                // Check if bunker is within the drawn shape
                let isInside = false;
                
                if (shapeType === 'circle') {
                    // For circles, check if bunker is within the radius
                    isInside = bunkerLatLng.distanceTo(shapeCenter) <= shapeRadius;
                } else if (shapeType === 'rectangle' || shapeType === 'polygon') {
                    // For rectangles and polygons, check if bunker is within bounds
                    isInside = shapeBounds.contains(bunkerLatLng);
                    
                    // For more accurate polygon containment, we would use point-in-polygon
                    // but bounds check is usually sufficient for this application
                }
                
                if (isInside) {
                    bunkersInside++;
                    totalShelterCapacity += bunker.plasser;
                    console.log(`Bunker ${index} is inside shape. Capacity: ${bunker.plasser}. Running total: ${totalShelterCapacity}`);
                }
            } catch (error) {
                console.error(`Error analyzing bunker ${index}:`, error);
            }
        });
    }
    
    console.log(`Bunker analysis complete. ${bunkersInside} bunkers inside the shape.`);
    console.log(`Total shelter capacity in drawn shape: ${totalShelterCapacity}`);
    
    // Calculate coverage percentage
    const coveragePercentage = totalPopulation > 0 
        ? (totalShelterCapacity / totalPopulation) * 100 
        : 0;
    
    console.log(`Coverage percentage: ${coveragePercentage.toFixed(2)}%`);
    
    // Update the UI with analysis results
    updateAnalysisResults(totalPopulation, totalShelterCapacity, coveragePercentage);
}

// Update the UI with analysis results
function updateAnalysisResults(population, capacity, coverage) {
    document.getElementById('analysis-info').textContent = 'Analyseresultater for det valgte området:';
    document.getElementById('population-count').textContent = `${population.toLocaleString()} personer`;
    document.getElementById('shelter-capacity').textContent = `${capacity.toLocaleString()} plasser`;
    document.getElementById('coverage-percentage').textContent = `${coverage.toFixed(2)}%`;
    
    // Apply color based on coverage percentage
    const coverageElement = document.getElementById('coverage-percentage');
    if (coverage < 33) {
        coverageElement.style.color = '#d32f2f'; // Red for poor coverage
    } else if (coverage < 66) {
        coverageElement.style.color = '#f57c00'; // Orange for medium coverage
    } else {
        coverageElement.style.color = '#388e3c'; // Green for good coverage
    }
    
    // Show results container
    document.getElementById('analysis-results').style.display = 'block';
}

// Clear analysis results in the UI
function clearAnalysisResults() {
    document.getElementById('analysis-info').textContent = 'Tegn et område på kartet for å analysere befolkning og tilfluktsromkapasitet.';
    document.getElementById('analysis-results').style.display = 'none';
}

export { initializeDrawing };