/**
 * Main entry point for the map application
 * Imports and initializes all modules
 */
import { initializeProjection, initializeMap } from './map/config.js';
import { getIcons } from './map/icons.js';
import { createLayers, addShelters, addBunkers } from './map/layers.js';
import { setupLocationTracking, setupCustomMarker } from './map/position.js';
import { createLocateControl, setupLayerControls } from './map/controls.js';
import { initializeDrawing } from './map/drawing.js';
import { addIsochrones, setupShelterIsochroneClick, clearAllIsochrones } from './map/isochrones.js';

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
        
        // Initialize isochrones but don't add to map immediately
        let clearAllIsochronesFunction = null;
        if (window.isochroneData) {
            // Initialize isochrone data
            addIsochrones(window.isochroneData, layers.isochroneLayer);
            
            // Import the clearAllIsochrones function
            const { clearAllIsochrones } = await import('./map/isochrones.js');
            clearAllIsochronesFunction = () => clearAllIsochrones(layers.isochroneLayer);
            
            // Setup shelter click handling for isochrones AFTER shelters are added
            setTimeout(() => {
                setupShelterIsochroneClick(
                    layers.shelterLayer, 
                    layers.bunkerLayer, 
                    layers.isochroneLayer
                );
            }, 500);
        }
        
        // Setup custom marker handling
        const customMarkerHandler = setupCustomMarker(
            map,
            layers.customLayer,
            layers.shelterLayer,
            layers.bunkerLayer,
            layers.routeLayer,
            icons
        );
        
        // Setup location tracking
        const locationTracker = setupLocationTracking(
            map,
            layers.positionLayer,
            layers.shelterLayer,
            layers.bunkerLayer,
            layers.routeLayer,
            icons
        );
        
        // Initialize drawing tools and analysis
        const drawingTools = initializeDrawing(map);
        
        // Create UI controls
        createLocateControl(map, locationTracker, customMarkerHandler);
        
        // Setup layer control checkboxes with clear isochrones function
        setupLayerControls(map, layers, clearAllIsochronesFunction);
        
        // Ensure map renders correctly
        setTimeout(() => {
            map.invalidateSize();
        }, 100);
        
        console.log('Map initialized successfully');
        
    } catch (error) {
        console.error('Map initialization error:', error);
    }
});