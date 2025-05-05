/**
 * Isochrones module
 * Handles display of walking distance isochrones from shelters
 */
// Add isochrones to the map
function addIsochrones(isochroneData, isochroneLayer) {
    if (!isochroneData || !isochroneData.length) {
        console.warn('No isochrone data available');
        return;
    }
    console.log(`Adding ${isochroneData.length} isochrones to map`);
    
    // Log the first isochrone to see its structure
    if (isochroneData.length > 0) {
        console.log('First isochrone structure:', Object.keys(isochroneData[0]));
    }
    // Define colors for different time ranges
    const colors = {
        5: '#e6c3ff',  // Light purple for 5 minutes
        10: '#b366ff', // Medium purple for 10 minutes
        15: '#9966cc'  // Dark purple for 15 minutes
    };
    isochroneData.forEach((isochrone, index) => {
        try {
            // Try both uppercase GEOM and lowercase geom
            const geometry = isochrone.GEOM || isochrone.geom;
            
            if (!geometry) {
                console.warn(`Isochrone ${index} has no geometry (tried both GEOM and geom)`);
                return;
            }
            // Determine color based on time
            const minutes = isochrone.aa_mins;
            const color = colors[minutes] || colors[15]; // Default to 15 min color if unknown
            
            // Create polygon and add to layer
            const polygon = L.geoJSON(geometry, {
                style: {
                    color: color,
                    weight: 2,
                    opacity: 0.7,
                    fillColor: color,
                    fillOpacity: 0.3
                }
            }).addTo(isochroneLayer);
            
            // Store walking time as property instead of binding a popup
            polygon.walkingTime = minutes;
            
            // We store the content but don't bind it to show on the map
            const popupContent = `<strong>Gåavstand:</strong> ${minutes} minutter`;
            polygon.popupContent = popupContent;
            
        } catch (error) {
            console.error(`Error processing isochrone ${index}:`, error);
        }
    });
}

// New function to set up click handling for isochrones
function setupIsochroneClickHandling(isochroneLayer, map) {
    if (!isochroneLayer || !map) return;
    
    isochroneLayer.eachLayer(function(layer) {
        // Add custom click handler
        layer.on('click', function(e) {
            // Update the info panel with walking time
            const minutes = layer.walkingTime || "ukjent";
            const infoPanel = document.getElementById('position-info');
            
            if (infoPanel) {
                infoPanel.innerHTML = `<div style="padding: 10px; background-color: #e9f5ff; border-radius: 4px; margin-bottom: 10px;">
                    <h4>Gåavstand</h4>
                    <p>${minutes} minutter</p>
                </div>`;
            }
            
            // Trigger a map click at the same location
            setTimeout(function() {
                map.fire('click', {
                    latlng: e.latlng,
                    originalEvent: { synthetic: true }
                });
            }, 50);
            
            // Stop propagation
            L.DomEvent.stop(e);
        });
    });
}

export { addIsochrones, setupIsochroneClickHandling };