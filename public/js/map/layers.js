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

    return {
        shelterLayer,
        bunkerLayer,
        positionLayer,
        customLayer,
        routeLayer,
        isochroneLayer
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

export {
    createLayers,
    addShelters,
    addBunkers,
    findClosestMarker
};