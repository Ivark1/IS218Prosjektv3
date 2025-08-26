// Isochrones module (merged, non-overlapping rings)
// Overlapping isochrones of the same time band are dissolved into 3 layers (5/10/15).
// Bands are rendered as rings to avoid opacity stacking.

const turf = window.turf;

// Raw data
let allIsochroneData = [];

// Tracks which shelters are currently toggled ON
// shelterId -> [{ minutes, feature }]
let visibleIsochrones = new Map();

// One entry per time band:
// minutes -> { union: Feature|MultiPolygon|null, parts: Feature[], layer: L.GeoJSON }
let mergedByTime = new Map();

// Colors per time band
const COLOR_BY_MIN = {
  5: '#2E7D32',
  10: '#FFEB3B',
  15: '#F44336'
};

// --- Utils ---

function toFeature(geometry, properties = {}) {
  if (!geometry) return null;
  if (geometry.type === 'Feature') {
    // merge properties
    return { ...geometry, properties: { ...(geometry.properties || {}), ...properties } };
  }
  if (geometry.type && geometry.coordinates) {
    return { type: 'Feature', geometry, properties };
  }
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

  // Optional: click info on band
  layer.on('click', (e) => {
    updateInfoPanel(`Gåavstand: ${minutes} minutter`);
    L.DomEvent.stop(e);
  });

  const entry = { union: null, parts: [], layer };
  mergedByTime.set(minutes, entry);
  return entry;
}

function recomputeUnion(minutes) {
  const entry = mergedByTime.get(minutes);
  if (!entry) return;
  let merged = null;
  for (const f of entry.parts) {
    merged = merged ? turf.union(merged, f) : f;
  }
  entry.union = merged || null;
}

// Make rings non-overlapping: 5 = U5, 10 = U10 \ U5, 15 = U15 \ U10
function updateRenderedBands() {
  const e5 = mergedByTime.get(5);
  const e10 = mergedByTime.get(10);
  const e15 = mergedByTime.get(15);

  const U5 = e5 ? e5.union : null;
  const U10 = e10 ? e10.union : null;
  const U15 = e15 ? e15.union : null;

  const B5 = U5 ? U5 : null;
  const B10 = (U10 && U5) ? turf.difference(U10, U5) : U10 ? U10 : null;
  const B15 = (U15 && U10) ? turf.difference(U15, U10) : U15 ? U15 : null;

  if (e5)  { e5.layer.clearLayers();  if (B5)  e5.layer.addData(B5); }
  if (e10) { e10.layer.clearLayers(); if (B10) e10.layer.addData(B10); }
  if (e15) { e15.layer.clearLayers(); if (B15) e15.layer.addData(B15); }
}

function unionInto(minutes, feature, isochroneLayer, shelterId) {
  const entry = ensureMergedLayer(minutes, isochroneLayer);
  // tag with shelter id so we can remove later
  feature = JSON.parse(JSON.stringify(feature)); // shallow clone to avoid side-effects
  if (!feature.properties) feature.properties = {};
  feature.properties.__sid = shelterId;

  entry.parts.push(feature);
  recomputeUnion(minutes);
  updateRenderedBands();
}

function subtractFrom(minutes, shelterIdOrFeature) {
  const entry = mergedByTime.get(minutes);
  if (!entry) return;

  entry.parts = entry.parts.filter(f => {
    if (typeof shelterIdOrFeature === 'string') {
      return f.properties?.__sid !== shelterIdOrFeature;
    }
    // removing by feature reference
    return f !== shelterIdOrFeature;
  });

  recomputeUnion(minutes);
  updateRenderedBands();
}

// --- Public API ---

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

// Setup click handling for shelters/bunkers ONLY
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
        } else if (
          geometry.type === 'MultiPolygon' &&
          geometry.coordinates[0] &&
          geometry.coordinates[0][0]
        ) {
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
        const rest = Array.from(bestByTime.keys()).sort((a, b) => a - b);
        for (const t of rest) {
          if (selected.length < 3 && !selected.find(s => s.aa_mins === t)) {
            selected.push(bestByTime.get(t).data);
          }
        }
      }
    }

    // Convert to Features for downstream ops
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

    // Toggle OFF: remove this shelter's contributions from each time band
    if (visibleIsochrones.has(shelterId)) {
      const entries = visibleIsochrones.get(shelterId); // [{ minutes, feature }]
      // Remove by shelterId tag; minutes hint speeds things up
      const minutesSet = new Set(entries.map(e => e.minutes));
      [5, 10, 15].forEach(m => {
        if (minutesSet.has(m)) subtractFrom(m, shelterId);
      });

      visibleIsochrones.delete(shelterId);
      updateInfoPanel(`Isokroner skjult for ${shelterType}`);
      return;
    }

    // Toggle ON: find features, add to contributors, rebuild rings
    const selections = findClosestIsochroneGroup(shelterLatLng);
    if (!selections.length) {
      updateInfoPanel(`Ingen isokroner funnet for denne ${shelterType.toLowerCase()}`);
      return;
    }

    selections
      .sort((a, b) => (b.minutes || 0) - (a.minutes || 0)) // 15,10,5
      .forEach(({ minutes, feature }) => unionInto(minutes, feature, isochroneLayer, shelterId));

    visibleIsochrones.set(shelterId, selections);
    updateInfoPanel(`
        <div>
            <p style="margin:0 0 6px 0;">
            Isokroner vist for ${shelterType} (${selections.length} tidssoner)
            </p>
            <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
            <span style="display:inline-flex; align-items:center; gap:6px;">
                <span aria-hidden="true" style="width:12px;height:12px;background:#2E7D32;border-radius:2px;display:inline-block;"></span>
                <span>Grønn: 5&nbsp;minutter gangavstand</span>
            </span>
            <span style="display:inline-flex; align-items:center; gap:6px;">
                <span aria-hidden="true" style="width:12px;height:12px;background:#FFEB3B;border-radius:2px;display:inline-block;border:1px solid rgba(0,0,0,0.25);"></span>
                <span>Gul: 10&nbsp;minutter gangavstand</span>
            </span>
            <span style="display:inline-flex; align-items:center; gap:6px;">
                <span aria-hidden="true" style="width:12px;height:12px;background:#F44336;border-radius:2px;display:inline-block;"></span>
                <span>Rød: 15&nbsp;minutter gangavstand</span>
            </span>
            </div>
        </div>
        `);
  }

  // Attach click handlers to shelters
  if (shelterLayer) {
    shelterLayer.eachLayer(layer => {
      if (layer instanceof L.Marker) {
        layer.off('click');
        layer.on('click', (e) => {
          handleShelterClick(layer, 'alternativt tilfluktsrom');
          L.DomEvent.stop(e);
        });
      }
    });
  }

  // Attach click handlers to bunkers
  if (bunkerLayer) {
    bunkerLayer.eachLayer(layer => {
      if (layer instanceof L.Marker) {
        layer.off('click');
        layer.on('click', (e) => {
          handleShelterClick(layer, 'offentlig tilfluktsrom');
          L.DomEvent.stop(e);
        });
      }
    });
  }

  console.log('Shelter isochrone click handlers set up (merged non-overlapping bands)');
}

// Clear everything
function clearAllIsochrones(isochroneLayer) {
  mergedByTime.forEach(({ layer }) => {
    layer.clearLayers();
    // Optionally: layer.remove();
  });
  mergedByTime.clear();
  visibleIsochrones.clear();
  updateInfoPanel('Alle isokroner fjernet');
}

// Info panel helper
function updateInfoPanel(message) {
  const infoPanel = document.getElementById('position-info');
  if (infoPanel) {
    infoPanel.innerHTML = `<div style="padding: 10px; background-color: #f0f8ff; border-radius: 4px; margin-bottom: 10px;">
      <p>${message}</p>
    </div>`;
  }
}

// Legacy noop
function setupIsochroneClickHandling(isochroneLayer, map) {
  console.log('Use setupShelterIsochroneClick (merged layers) instead of setupIsochroneClickHandling');
}

// Exports
export {
  addIsochrones,
  initializeIsochrones,
  setupShelterIsochroneClick,
  clearAllIsochrones,
  setupIsochroneClickHandling
};
