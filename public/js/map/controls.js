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
          <span style="font-size: 16px; line-height: 10px;">Finn min posisjon</span>
        </button>
      </div>
    `;

    // Prevent map clicks from propagating through the control
    L.DomEvent.disableClickPropagation(div);

    return div;
  };

  locateControl.addTo(map);

  // Zoom controls
  L.control.zoom({ position: 'topright' }).addTo(map);

  // Zoom level display
  const zoomControl = L.control({ position: 'bottomright' });

  zoomControl.onAdd = function () {
    const div = L.DomUtil.create('div', 'zoom-level-control');
    div.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <div style="padding: 10px; background: white; border: 1px solid #ccc; border-radius: 4px; display: flex; align-items: center;">
          <span style="font-size: 16px; line-height: 10px;">Zoom: ${map.getZoom()}</span>
        </div>
      </div>
    `;

    map.on('zoomend', () => {
      const span = div.querySelector('span');
      if (span) span.textContent = `Zoom: ${map.getZoom()}`;
    });

    // Prevent map clicks from propagating through the control
    L.DomEvent.disableClickPropagation(div);

    return div;
  };

  zoomControl.addTo(map);

  // Bind buttons after DOM is ready
  setTimeout(() => {
    const locateBtn = document.getElementById('locate-button');
    if (locateBtn) {
      locateBtn.addEventListener('click', function () {
        map.locate({
          setView: true,
          maxZoom: 16,
          enableHighAccuracy: true
        });
      });
    }

    // Optional: a button with id="clear-custom-button" may or may not exist
    const clearCustomBtn = document.getElementById('clear-custom-button');
    if (clearCustomBtn && customMarkerHandler && typeof customMarkerHandler.clearMarker === 'function') {
      clearCustomBtn.addEventListener('click', function () {
        customMarkerHandler.clearMarker();
      });
    }
  }, 100);
}

// Setup layer control checkboxes
function setupLayerControls(map, layers, clearAllIsochronesFunction = null) {
  setTimeout(() => {
    const shelterCb   = document.getElementById('shelter-checkbox');
    const bunkerCb    = document.getElementById('bunker-checkbox');
    const positionCb  = document.getElementById('position-checkbox');
    const customCb    = document.getElementById('custom-checkbox');
    const routeCb     = document.getElementById('route-checkbox');
    const isoCb       = document.getElementById('isochrone-checkbox');
    const clearIsoBtn = document.getElementById('clear-isochrones-button');

    // Shelters: show/hide markers ONLY
    shelterCb?.addEventListener('change', (e) => {
      if (e.target.checked) {
        map.addLayer(layers.shelterLayer);
      } else {
        map.removeLayer(layers.shelterLayer);
        // Do NOT clear isochrones here.
      }
    });

    // Bunkers: show/hide markers ONLY
    bunkerCb?.addEventListener('change', (e) => {
      if (e.target.checked) {
        map.addLayer(layers.bunkerLayer);
      } else {
        map.removeLayer(layers.bunkerLayer);
        // Do NOT clear isochrones here.
      }
    });

    // Position layer
    positionCb?.addEventListener('change', (e) => {
      if (e.target.checked) {
        map.addLayer(layers.positionLayer);
      } else {
        map.removeLayer(layers.positionLayer);
      }
    });

    // Custom marker layer
    customCb?.addEventListener('change', (e) => {
      if (e.target.checked) {
        map.addLayer(layers.customLayer);
      } else {
        map.removeLayer(layers.customLayer);
      }
    });

    // Route layer
    routeCb?.addEventListener('change', (e) => {
      if (e.target.checked) {
        map.addLayer(layers.routeLayer);
      } else {
        map.removeLayer(layers.routeLayer);
      }
    });

    // Isochrones: toggle visibility ONLY (preserve computed shapes in memory)
    isoCb?.addEventListener('change', (e) => {
      if (e.target.checked) {
        map.addLayer(layers.isochroneLayer);
        const infoPanel = document.getElementById('position-info');
        if (infoPanel) {
          infoPanel.innerHTML = `<div style="padding: 10px; background-color: #e6f3ff; border-radius: 4px; margin-bottom: 10px;">
            <h4 style="margin:0 0 6px 0;">Isokroner aktivert</h4>
            <p style="margin:0;">Klikk på tilfluktsrom for å se gåavstander!</p>
          </div>`;
        }
      } else {
        map.removeLayer(layers.isochroneLayer);
        // Do NOT clear here; let the user re-show without recomputing.
      }
    });

    // The ONLY place that wipes all isochrones:
    clearIsoBtn?.addEventListener('click', () => {
      if (clearAllIsochronesFunction) {
        clearAllIsochronesFunction();
      }
    });
  }, 200);
}

export { createLocateControl, setupLayerControls };
