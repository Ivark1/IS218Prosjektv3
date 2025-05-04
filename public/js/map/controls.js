/**
 * Controls module
 * Handles map controls such as layers, locate button, etc.
 */

// Create locate control button
function createLocateControl(map, locationTracker, customMarkerHandler) {
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

    // Zoom-knapper øverst til høyre
    L.control.zoom({ position: 'topright' }).addTo(map);

    // Zoom level control
    const zoomControl = L.control({ position: 'bottomright' });

    zoomControl.onAdd = function () {
        const div = L.DomUtil.create('div', 'zoom-level-control');
        div.style.backgroundColor = 'white';
        div.style.padding = '4px 8px';
        div.style.borderRadius = '4px';
        div.style.boxShadow = '0 1px 4px rgba(0,0,0,0.2)';
        div.style.fontSize = '14px';
        div.innerHTML = `Zoom: ${map.getZoom()}`;

        map.on('zoomend', () => {
            div.innerHTML = `Zoom: ${map.getZoom()}`;
        });

        return div;
    };

    zoomControl.addTo(map);
    
    // Add event listener for locate button
    setTimeout(() => {
        document.getElementById('locate-button').addEventListener('click', function () {
            map.locate({
                setView: true,
                maxZoom: 16,
                enableHighAccuracy: true
            });
        });

        // Add event listener for clear custom marker button
        document.getElementById('clear-custom-button').addEventListener('click', function () {
            if (customMarkerHandler && typeof customMarkerHandler.clearMarker === 'function') {
                customMarkerHandler.clearMarker();
            }
        });
    }, 100);
}

// Setup layer control checkboxes
function setupLayerControls(map, layers) {
    setTimeout(() => {
        // Setup event listeners for checkboxes
        document.getElementById('shelter-checkbox').addEventListener('change', function (e) {
            if (e.target.checked) {
                map.addLayer(layers.shelterLayer);
            } else {
                map.removeLayer(layers.shelterLayer);
            }
        });

        document.getElementById('bunker-checkbox').addEventListener('change', function (e) {
            if (e.target.checked) {
                map.addLayer(layers.bunkerLayer);
            } else {
                map.removeLayer(layers.bunkerLayer);
            }
        });

        document.getElementById('position-checkbox').addEventListener('change', function (e) {
            if (e.target.checked) {
                map.addLayer(layers.positionLayer);
            } else {
                map.removeLayer(layers.positionLayer);
            }
        });

        document.getElementById('custom-checkbox').addEventListener('change', function (e) {
            if (e.target.checked) {
                map.addLayer(layers.customLayer);
            } else {
                map.removeLayer(layers.customLayer);
            }
        });

        document.getElementById('route-checkbox').addEventListener('change', function (e) {
            if (e.target.checked) {
                map.addLayer(layers.routeLayer);
            } else {
                map.removeLayer(layers.routeLayer);
            }
        });    

        if (document.getElementById('isochrone-checkbox')) {
            document.getElementById('isochrone-checkbox').addEventListener('change', function (e) {
                if (e.target.checked) {
                    map.addLayer(layers.isochroneLayer);
                } else {
                    map.removeLayer(layers.isochroneLayer);
                }
            });
        }
    }, 200);
}            

export { createLocateControl, setupLayerControls };