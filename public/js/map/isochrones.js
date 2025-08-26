/**
 * Isochrones module
 * Handles display of walking distance isochrones from shelters
 */

// Store isochrone data and visible isochrones
let allIsochroneData = [];
let visibleIsochrones = new Map(); // Maps shelter ID to isochrone layers

// Initialize isochrone system
function initializeIsochrones(isochroneData, isochroneLayer) {
    if (!isochroneData || !isochroneData.length) {
        console.warn('No isochrone data available');
        return;
    }
    
    // Store the data for later use
    allIsochroneData = isochroneData;
    console.log(`Initialized ${isochroneData.length} isochrones`);
    
    // Don't add isochrones to map immediately - they'll be added on shelter click
}

// Add isochrones to the map (original function - kept for backwards compatibility)
function addIsochrones(isochroneData, isochroneLayer) {
    initializeIsochrones(isochroneData, isochroneLayer);
}

// Setup click handling for shelters to show/hide isochrones
function setupShelterIsochroneClick(shelterLayer, bunkerLayer, isochroneLayer) {
    if (!allIsochroneData || !allIsochroneData.length) {
        console.warn('No isochrone data available for shelter clicks');
        return;
    }
    
    // Define colors for different time ranges
    const colors = {
        5: '#2E7D32',   // Green for 5 minutes
        10: '#FFEB3B',  // Yellow for 10 minutes  
        15: '#F44336'   // Red for 15 minutes
    };
    
    // Function to find all isochrones that belong to the closest shelter
    function findClosestIsochroneGroup(shelterLatLng) {
        console.log('=== Finding isochrones for shelter at:', shelterLatLng);
        
        // First, let's see what time values exist in the entire dataset
        const allTimeValues = [...new Set(allIsochroneData.map(iso => iso.aa_mins))].sort((a, b) => a - b);
        console.log('All time values in dataset:', allTimeValues);
        
        // Find all isochrones within a reasonable distance from the shelter
        const candidateIsochrones = [];
        
        allIsochroneData.forEach((isochrone, index) => {
            try {
                const geometry = isochrone.GEOM || isochrone.geom;
                if (!geometry || !geometry.coordinates) return;
                
                // Calculate approximate center of the isochrone
                let centerLat = 0, centerLng = 0, pointCount = 0;
                
                if (geometry.type === 'Polygon' && geometry.coordinates[0]) {
                    geometry.coordinates[0].forEach(coord => {
                        centerLng += coord[0];
                        centerLat += coord[1];
                        pointCount++;
                    });
                } else if (geometry.type === 'MultiPolygon' && geometry.coordinates[0] && geometry.coordinates[0][0]) {
                    geometry.coordinates[0][0].forEach(coord => {
                        centerLng += coord[0];
                        centerLat += coord[1];
                        pointCount++;
                    });
                }
                
                if (pointCount > 0) {
                    centerLat /= pointCount;
                    centerLng /= pointCount;
                    
                    const centerLatLng = L.latLng(centerLat, centerLng);
                    const distance = shelterLatLng.distanceTo(centerLatLng);
                    
                    // Include all isochrones within 3km of the shelter
                    if (distance <= 3000) {
                        candidateIsochrones.push({
                            data: isochrone,
                            center: centerLatLng,
                            distance: distance,
                            minutes: isochrone.aa_mins,
                            index: index
                        });
                    }
                }
            } catch (error) {
                console.error(`Error processing isochrone ${index}:`, error);
            }
        });
        
        console.log(`Found ${candidateIsochrones.length} candidate isochrones within 3km`);
        
        if (candidateIsochrones.length === 0) {
            return [];
        }
        
        // Sort by distance to find the closest
        candidateIsochrones.sort((a, b) => a.distance - b.distance);
        
        // Log the closest few candidates
        console.log('Closest 10 candidates:', candidateIsochrones.slice(0, 10).map(c => ({
            distance: Math.round(c.distance),
            minutes: c.minutes,
            index: c.index
        })));
        
        // Strategy 1: Try to find a complete set (5, 10, 15) from the closest shelter point
        const closestDistance = candidateIsochrones[0].distance;
        const tolerance = Math.max(500, closestDistance * 0.5); // Dynamic tolerance
        
        console.log(`Using tolerance of ${tolerance}m for grouping isochrones`);
        
        const nearbyIsochrones = candidateIsochrones.filter(c => c.distance <= tolerance);
        console.log(`Found ${nearbyIsochrones.length} isochrones within ${tolerance}m tolerance`);
        console.log('Time values in nearby group:', nearbyIsochrones.map(c => c.minutes).sort((a, b) => a - b));
        
        // If we have a good set, return it
        if (nearbyIsochrones.length >= 2) {
            const uniqueTimes = [...new Set(nearbyIsochrones.map(c => c.minutes))];
            console.log('Unique time values in group:', uniqueTimes.sort((a, b) => a - b));
            
            // Remove duplicates - keep the closest isochrone for each time value
            const uniqueIsochrones = [];
            const timeToIsochrone = new Map();
            
            nearbyIsochrones.forEach(candidate => {
                const minutes = candidate.minutes;
                if (!timeToIsochrone.has(minutes) || 
                    candidate.distance < timeToIsochrone.get(minutes).distance) {
                    timeToIsochrone.set(minutes, candidate);
                }
            });
            
            timeToIsochrone.forEach(candidate => {
                uniqueIsochrones.push(candidate.data);
            });
            
            console.log(`Returning ${uniqueIsochrones.length} unique isochrones with times:`, 
                       uniqueIsochrones.map(iso => iso.aa_mins).sort((a, b) => a - b));
            
            return uniqueIsochrones;
        }
        
        // Strategy 2: If no good group found, take the 3 closest different time values
        console.log('No good group found, taking closest different time values');
        
        const timeToClosest = new Map();
        candidateIsochrones.forEach(candidate => {
            const minutes = candidate.minutes;
            if (!timeToClosest.has(minutes) || 
                candidate.distance < timeToClosest.get(minutes).distance) {
                timeToClosest.set(minutes, candidate);
            }
        });
        
        // Take up to 3 different time values, prioritizing 5, 10, 15 if available
        const preferredTimes = [5, 10, 15];
        const selectedIsochrones = [];
        
        preferredTimes.forEach(time => {
            if (timeToClosest.has(time)) {
                selectedIsochrones.push(timeToClosest.get(time).data);
                timeToClosest.delete(time);
            }
        });
        
        // If we don't have 3 yet, add any remaining times
        const remainingTimes = Array.from(timeToClosest.keys()).sort((a, b) => a - b);
        remainingTimes.forEach(time => {
            if (selectedIsochrones.length < 3) {
                selectedIsochrones.push(timeToClosest.get(time).data);
            }
        });
        
        console.log(`Final selection: ${selectedIsochrones.length} isochrones with times:`, 
                   selectedIsochrones.map(iso => iso.aa_mins).sort((a, b) => a - b));
        
        return selectedIsochrones;
    }
    
    // Function to handle shelter/bunker clicks
    function handleShelterClick(marker, shelterType) {
        // Prevent event from bubbling to map
        L.DomEvent.stop;
        
        const shelterLatLng = marker.getLatLng();
        const shelterId = `${Math.round(shelterLatLng.lat * 10000)}_${Math.round(shelterLatLng.lng * 10000)}`;
        
        console.log(`Clicked ${shelterType} at:`, shelterLatLng);
        
        // Check if isochrones are already visible for this shelter
        if (visibleIsochrones.has(shelterId)) {
            // Remove existing isochrones for this shelter
            const existingLayers = visibleIsochrones.get(shelterId);
            existingLayers.forEach(layer => {
                isochroneLayer.removeLayer(layer);
            });
            visibleIsochrones.delete(shelterId);
            
            // Update info panel
            updateInfoPanel(`Isokroner skjult for ${shelterType}`);
            console.log(`Removed isochrones for shelter ${shelterId}`);
            return;
        }
        
        // Find isochrones for this shelter
        const shelterIsochrones = findClosestIsochroneGroup(shelterLatLng);
        
        if (shelterIsochrones.length === 0) {
            updateInfoPanel(`Ingen isokroner funnet for denne ${shelterType.toLowerCase()}`);
            console.log(`No isochrones found for shelter at:`, shelterLatLng);
            return;
        }
        
        console.log(`Found ${shelterIsochrones.length} isochrones for shelter`);
        
        // Create and add isochrone layers for this shelter
        const createdLayers = [];
        
        shelterIsochrones.forEach((isochrone, index) => {
            try {
                // Try both uppercase GEOM and lowercase geom
                const geometry = isochrone.GEOM || isochrone.geom;
                
                if (!geometry) {
                    console.warn(`Isochrone ${index} has no geometry`);
                    return;
                }
                
                // Determine color based on time
                const minutes = isochrone.aa_mins;
                const color = colors[minutes] || colors[15];
                
                // Create polygon and add to layer
                const polygon = L.geoJSON(geometry, {
                    style: {
                        color: color,
                        weight: 2,
                        opacity: 0.7,
                        fillColor: color,
                        fillOpacity: 0.3,
                        className: `isochrone-${shelterId}` // Add class for identification
                    }
                }).addTo(isochroneLayer);
                
                // Store walking time as property
                polygon.walkingTime = minutes;
                polygon.shelterId = shelterId;
                
                // Add click handler to individual isochrone
                polygon.on('click', function(e) {
                    const infoPanel = document.getElementById('position-info');
                    if (infoPanel) {
                        infoPanel.innerHTML = `<div style="padding: 10px; background-color: #e9f5ff; border-radius: 4px; margin-bottom: 10px;">
                            <h4>Gåavstand fra ${shelterType}</h4>
                            <p>${minutes} minutter</p>
                        </div>`;
                    }
                    L.DomEvent.stop(e);
                });
                
                createdLayers.push(polygon);
                
            } catch (error) {
                console.error(`Error processing isochrone ${index}:`, error);
            }
        });
        
        // Store the isochrones for this shelter
        if (createdLayers.length > 0) {
            visibleIsochrones.set(shelterId, createdLayers);
            updateInfoPanel(`Isokroner vist for ${shelterType} (${createdLayers.length} tidssoner)`);
            console.log(`Added ${createdLayers.length} isochrones for shelter ${shelterId}`);
        }
    }
    
    // Add click handlers to shelter markers
    if (shelterLayer) {
        shelterLayer.eachLayer(function(layer) {
            if (layer instanceof L.Marker) {
                // Clear any existing click handlers
                layer.off('click');
                
                layer.on('click', function(e) {
                    console.log('Shelter marker clicked');
                    handleShelterClick(layer, 'alternativt tilfluktsrom');
                    L.DomEvent.stop(e); // Prevent event from bubbling to map
                });
            }
        });
    }
    
    // Add click handlers to bunker markers
    if (bunkerLayer) {
        bunkerLayer.eachLayer(function(layer) {
            if (layer instanceof L.Marker) {
                // Clear any existing click handlers
                layer.off('click');
                
                layer.on('click', function(e) {
                    console.log('Bunker marker clicked');
                    handleShelterClick(layer, 'offentlig tilfluktsrom');
                    L.DomEvent.stop(e); // Prevent event from bubbling to map
                });
            }
        });
    }
    
    console.log('Shelter isochrone click handlers set up');
}

// Function to clear all visible isochrones
function clearAllIsochrones(isochroneLayer) {
    visibleIsochrones.forEach((layers, shelterId) => {
        layers.forEach(layer => {
            isochroneLayer.removeLayer(layer);
        });
    });
    visibleIsochrones.clear();
    updateInfoPanel('Alle isokroner fjernet');
}

// Function to update info panel
function updateInfoPanel(message) {
    const infoPanel = document.getElementById('position-info');
    if (infoPanel) {
        infoPanel.innerHTML = `<div style="padding: 10px; background-color: #f0f8ff; border-radius: 4px; margin-bottom: 10px;">
            <p>${message}</p>
        </div>`;
    }
}

// Legacy function for backwards compatibility
function setupIsochroneClickHandling(isochroneLayer, map) {
    // This function is now handled by setupShelterIsochroneClick
    console.log('Use setupShelterIsochroneClick instead of setupIsochroneClickHandling');
}

export { 
    addIsochrones, 
    initializeIsochrones,
    setupShelterIsochroneClick, 
    clearAllIsochrones,
    setupIsochroneClickHandling // Keep for backwards compatibility
};