// Isochrones module (merged layers version)
// Overlapping isochrones of the same time band are dissolved into a single layer.

const turf = window.turf;

// Store raw data and shelter-visible state
let allIsochroneData = [];
// Maps shelter ID -> [{ minutes, feature }] so we can remove them later
let visibleIsochrones = new Map();

// One merged layer per time band: minutes -> { feature: Feature|MultiPolygon, layer: L.GeoJSON }
let mergedByTime = new Map();

// Colors per time band
const COLOR_BY_MIN = {
  5: '#2E7D32',
  10: '#FFEB3B',
  15: '#F44336'
};

// Utils
function toFeature(geometry, properties = {}) {
  // Accepts {type, coordinates} or full Feature
  if (!geometry) return null;
  if (geometry.type && geometry.coordinates && !geometry.properties) {
    return { type: 'Feature', geometry, properties };
  }
  if (geometry.type === 'Feature') return geometry;
  return null;
}

function ensureMergedLayer(minutes, isochroneLayer) {
  if (mergedByTime.has(minutes)) return mergedByTime.get(minutes);

  const color = COLOR_BY_MIN[minutes] || COLOR_BY_MIN[15];
  const layer = L.geoJSON(null, {
    style: {
      color,
      weight: 2,
      opacity: 0.7,
      fillColor: color,
      fillOpacity: 0.3,
      className: `isochrone-merged-${minutes}`
    }
  }).addTo(isochroneLayer);

  const entry = { feature: null, layer };
  mergedByTime.set(minutes, entry);
  return entry;
}

function unionInto(minutes, feature, isochroneLayer) {
  const entry = ensureMergedLayer(minutes, isochroneLayer);
  entry.feature = entry.feature ? turf.union(entry.feature, feature) : feature;
  // Refresh layer content
  entry.layer.clearLayers();
  if (entry.feature) entry.layer.addData(entry.feature);
}

function subtractFrom(minutes, feature) {
  const entry = mergedByTime.get(minutes);
  if (!entry || !entry.feature) return;

  const result = turf.difference(entry.feature, feature);
  entry.feature = result || null;

  entry.layer.clearLayers();
  if (entry.feature) {
    entry.layer.addData(entry.feature);
  } else {
    // nothing left for this time band
    // keep empty layer so future unions reuse styling; or remove it if you prefer:
    // entry.layer.remove(); mergedByTime.delete(minutes);
  }
}

// Initialize isochrone system
function initializeIsochrones(isochroneData, isochroneLayer) {
  if (!isochroneData || !isochroneData.length) {
    console.warn('No isochrone data available');
    return;
  }
  allIsochroneData = isochroneData;
  console.log(`Initialized ${isochroneData.length} isochrones`);
}

// Back-compat
function addIsochrones(isochroneData, isochroneLayer) {
  initializeIsochrones(isochroneData, isochroneLayer);
}

// Find closest group (unchanged logic apart from returning Features)
function setupShelterIsochroneClick(shelterLayer, bunkerLayer, isochroneLayer) {
  if (!allIsochroneData || !allIsochroneData.length) {
    console.warn('No isochrone data available for shelter clicks');
    return;
  }

  function findClosestIsochroneGroup(shelterLatLng) {
    const candidateIsochrones = [];

    allIsochroneData.forEach((isochrone, index) => {
      try {
        const geometry = isochrone.GEOM || isochrone.geom;
        if (!geometry || !geometry.coordinates) return;

        let centerLat = 0, centerLng = 0, pointCount = 0;
        if (geometry.type === 'Polygon' && geometry.coordinates[0]) {
          geometry.coordinates[0].forEach(coord => {
            centerLng += coord[0]; centerLat += coord[1]; pointCount++;
          });
        } else if (geometry.type === 'MultiPolygon' && geometry.coordinates[0] && geometry.coordinates[0][0]) {
          geometry.coordinates[0][0].forEach(coord => {
            centerLng += coord[0]; centerLat += coord[1]; pointCount++;
          });
        }

        if (pointCount > 0) {
          centerLat /= pointCount; centerLng /= pointCount;
          const centerLatLng = L.latLng(centerLat, centerLng);
          const distance = shelterLatLng.distanceTo(centerLatLng);
          if (distance <= 3000) {
            candidateIsochrones.push({
              data: isochrone,
              distance,
              minutes: isochrone.aa_mins,
              index
            });
          }
        }
      } catch (e) {
        console.error(`Error processing isochrone ${index}:`, e);
      }
    });

    if (!candidateIsochrones.length) return [];

    candidateIsochrones.sort((a, b) => a.distance - b.distance);
    const closestDistance = candidateIsochrones[0].distance;
    const tolerance = Math.max(500, closestDistance * 0.5);
    const nearby = candidateIsochrones.filter(c => c.distance <= tolerance);

    let selected = [];
    if (nearby.length >= 2) {
      const bestByTime = new Map();
      nearby.forEach(c => {
        if (!bestByTime.has(c.minutes) || c.distance < bestByTime.get(c.minutes).distance) {
          bestByTime.set(c.minutes, c);
        }
      });
      selected = Array.from(bestByTime.values()).map(v => v.data);
    } else {
      const bestByTime = new Map();
      candidateIsochrones.forEach(c => {
        if (!bestByTime.has(c.minutes) || c.distance < bestByTime.get(c.minutes).distance) {
          bestByTime.set(c.minutes, c);
        }
      });
      [5, 10, 15].forEach(t => bestByTime.has(t) && selected.push(bestByTime.get(t).data));
      if (selected.length < 3) {
        const rest = Array.from(bestByTime.keys()).sort((a,b)=>a-b);
        for (const t of rest) {
          if (selected.length < 3 && !selected.find(s => s.aa_mins === t)) {
            selected.push(bestByTime.get(t).data);
          }
        }
      }
    }

    // Return as Features for downstream ops
    return selected
      .map(iso => {
        const f = toFeature(iso.GEOM || iso.geom, { aa_mins: iso.aa_mins });
        return f ? { minutes: iso.aa_mins, feature: f } : null;
      })
      .filter(Boolean);
  }

  function handleShelterClick(marker, shelterType) {
    const shelterLatLng = marker.getLatLng();
    const shelterId = `${Math.round(shelterLatLng.lat * 10000)}_${Math.round(shelterLatLng.lng * 10000)}`;

    // Toggle OFF: subtract this shelter's features from merged layers
    if (visibleIsochrones.has(shelterId)) {
      const entries = visibleIsochrones.get(shelterId);
      entries.forEach(({ minutes, feature }) => subtractFrom(minutes, feature));
      visibleIsochrones.delete(shelterId);
      updateInfoPanel(`Isokroner skjult for ${shelterType}`);
      return;
    }

    // Toggle ON: find features, union into merged layers, remember for later removal
    const selections = findClosestIsochroneGroup(shelterLatLng);
    if (!selections.length) {
      updateInfoPanel(`Ingen isokroner funnet for denne ${shelterType.toLowerCase()}`);
      return;
    }

    // Union each time band into its merged layer
    selections
      .sort((a, b) => (b.minutes || 0) - (a.minutes || 0)) // 15,10,5
      .forEach(({ minutes, feature }) => unionInto(minutes, feature, isochroneLayer));

    // Remember what we added for this shelter so we can subtract later
    visibleIsochrones.set(shelterId, selections);

    updateInfoPanel(`Isokroner vist for ${shelterType} (${selections.length} tidssoner)`);
  }

  // Attach click handlers (same as before)
  if (shelterLayer) {
    shelterLayer.eachLayer(layer => {
      if (layer instanceof L.Marker) {
        layer.off('click');
        layer.on('click', e => {
          handleShelterClick(layer, 'alternativt tilfluktsrom');
          L.DomEvent.stop(e);
        });
      }
    });
  }

  if (bunkerLayer) {
    bunkerLayer.eachLayer(layer => {
      if (layer instanceof L.Marker) {
        layer.off('click');
        layer.on('click', e => {
          handleShelterClick(layer, 'offentlig tilfluktsrom');
          L.DomEvent.stop(e);
        });
      }
    });
  }

  console.log('Shelter isochrone click handlers set up (merged layers)');
}

function clearAllIsochrones(isochroneLayer) {
  // Clear merged layers
  mergedByTime.forEach(({ layer }) => {
    layer.clearLayers();
    // Optionally remove from map: layer.remove();
  });
  mergedByTime.clear();

  // Clear shelter state
  visibleIsochrones.clear();

  updateInfoPanel('Alle isokroner fjernet');
}

function updateInfoPanel(message) {
  const infoPanel = document.getElementById('position-info');
  if (infoPanel) {
    infoPanel.innerHTML = `<div style="padding: 10px; background-color: #f0f8ff; border-radius: 4px; margin-bottom: 10px;">
      <p>${message}</p>
    </div>`;
  }
}

// Back-compat note
function setupIsochroneClickHandling(isochroneLayer, map) {
  console.log('Use setupShelterIsochroneClick (merged layers) instead of setupIsochroneClickHandling');
}

export {
  addIsochrones,
  initializeIsochrones,
  setupShelterIsochroneClick,
  clearAllIsochrones,
  setupIsochroneClickHandling
};
