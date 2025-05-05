/**
 * Main entry point for the map application
 * Imports and initializes all modules
 */
import { initializeProjection, initializeMap } from './map/config.js';
import { getIcons } from './map/icons.js';
import { createLayers, addShelters, addBunkers, setupPopulationClickHandling } from './map/layers.js';
import { setupLocationTracking, setupCustomMarker } from './map/position.js';
import { createLocateControl, setupLayerControls } from './map/controls.js';
import { initializeDrawing } from './map/drawing.js';
import { addIsochrones, setupIsochroneClickHandling } from './map/isochrones.js';

document.addEventListener('DOMContentLoaded', async function () {
    try {
        // Initialize projection
        if (!initializeProjection()) {
            return;
        }
        // Initialize map
        const map = initializeMap();
        // Create layer groups
        const layers = createLayers(map);
        // Load icons
        const icons = await getIcons();
        // Add data points to map
        addShelters(window.shelterData, layers.shelterLayer, icons.shelterIcon);
        addBunkers(window.bunkerData, layers.bunkerLayer, icons.bunkerIcon);
        
        // Setup custom marker handling
        const customMarkerHandler = setupCustomMarker(
            map,
            layers.customLayer,
            layers.shelterLayer,
            layers.bunkerLayer,
            layers.routeLayer,
            icons
        );
        
        // Add isochrones if data exists
        if (window.isochroneData) {
            addIsochrones(window.isochroneData, layers.isochroneLayer);
            // Setup isochrone click handling
            setupIsochroneClickHandling(layers.isochroneLayer, map);
        }
        
        // Initialize drawing tools and analysis
        const drawingTools = initializeDrawing(map);
        
        // Setup population layer click handling
        // The drawing module creates its own populationLayer
        if (drawingTools && drawingTools.populationLayer) {
            console.log('Setting up population click handling for drawing tools population layer');
            setupPopulationClickHandling(drawingTools.populationLayer, map);
        }
        
        // Setup location tracking
        const locationTracker = setupLocationTracking(
            map,
            layers.positionLayer,
            layers.shelterLayer,
            layers.bunkerLayer,
            layers.routeLayer,
            icons
        );
        
        // Create UI controls
        createLocateControl(map, locationTracker, customMarkerHandler);
        // Setup layer control checkboxes
        setupLayerControls(map, layers);
        
        // Ensure map renders correctly
        setTimeout(() => {
            map.invalidateSize();
            
            // Additional setup for population layers that might be added after initialization
            // This catches population layers that might be added by other modules
            map.eachLayer(function(layer) {
                if (layer instanceof L.LayerGroup) {
                    layer.eachLayer(function(sublayer) {
                        if (sublayer._popup && sublayer._popup._content && 
                            sublayer._popup._content.includes('Befolkning')) {
                            console.log('Found population layer through map search');
                            setupPopulationClickHandling(sublayer, map);
                        }
                    });
                }
            });
        }, 100);
        
        console.log('Map initialized successfully');
    } catch (error) {
        console.error('Map initialization error:', error);
    }
});