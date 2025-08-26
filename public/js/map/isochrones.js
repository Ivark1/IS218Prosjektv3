/**
 * Isochrones-modul
 * Håndterer visning av isokroner for gangavstand som ikke-overlappende ringer.
 * Sørger for at mindre tidsintervaller alltid vises over større, og at det ikke er noen
 * visuell overlapping der farger blandes.
 * 
 * KREVER TURF.JS VIA CDN:
 * Inkluder denne i din HTML: <script src="https://cdn.jsdelivr.net/npm/@turf/turf@7/turf.min.js"></script>
 */

// Hent turf fra det globale window-objektet (CDN-versjon)
const getTurf = () => {
    if (typeof window !== 'undefined' && window.turf) {
        return window.turf;
    }
    throw new Error('Turf.js not loaded. Include <script src="https://cdn.jsdelivr.net/npm/@turf/turf@7/turf.min.js"></script> in your HTML.');
};

// Konfigurasjon for isokron-farger
export const ISOCHRONE_COLORS = {
    5: '#FFFF00',   // Lys gul for 5 minutter
    10: '#b366ff',  // Medium lilla for 10 minutter  
    15: '#9966cc'   // Mørk lilla for 15 minutter
};

/**
 * Henter minuttverdien fra feature-properties.
 */
function getMinutes(feature) {
    const props = feature.properties || {};
    const candidates = [
        props.minutes, props.walkingTime, props.aa_mins, props.time, props.mins
    ];
    for (const candidate of candidates) {
        if (typeof candidate === 'number' && candidate > 0) {
            return candidate;
        }
    }
    return null;
}

/**
 * Konverterer ulike input-formater til en GeoJSON FeatureCollection.
 */
function toFeatureCollection(data) {
    if (!data) return { type: 'FeatureCollection', features: [] };
    if (data.type === 'FeatureCollection') return data;
    if (data.type === 'Feature') return { type: 'FeatureCollection', features: [data] };
    
    if (Array.isArray(data)) {
        const features = data.map(item => {
            const geometry = item.GEOM || item.geom;
            if (!geometry) return null;
            const minutes = item.aa_mins || item.minutes || item.walkingTime;
            return {
                type: 'Feature',
                properties: { minutes: minutes },
                geometry: geometry
            };
        }).filter(Boolean);
        return { type: 'FeatureCollection', features };
    }
    
    console.warn('Ukjent dataformat for isokroner:', data);
    return { type: 'FeatureCollection', features: [] };
}

/**
 * Slår sammen en liste med features til ett enkelt polygon.
 * Inkluderer robust feilhåndtering.
 */
function robustUnion(features, layerName) {
    if (!features || features.length === 0) {
        console.log(`Ingen features å slå sammen for ${layerName}.`);
        return null;
    }
    
    const turf = getTurf();
    let unionResult = null;
    
    try {
        // turf.union kan ta en FeatureCollection direkte
        const featureCollection = turf.featureCollection(features);
        unionResult = turf.union(featureCollection);
    } catch (error) {
        console.error(`Feil under turf.union for ${layerName}:`, error);
        // Fallback: prøv å slå sammen én og én, og hopp over de som feiler
        console.log("Prøver en mer robust, men tregere, union-metode...");
        let validFeatures = [];
        features.forEach(feature => {
            try {
                // En enkel sjekk for å se om geometrien er OK
                turf.area(feature); 
                validFeatures.push(feature);
            } catch (e) {
                console.warn("Hopper over ugyldig geometri:", feature);
            }
        });

        if(validFeatures.length > 0) {
            unionResult = validFeatures[0];
            for (let i = 1; i < validFeatures.length; i++) {
                try {
                    unionResult = turf.union(unionResult, validFeatures[i]);
                } catch(innerError) {
                    console.warn(`Kunne ikke slå sammen feature ${i}, hopper over.`, innerError);
                }
            }
        }
    }

    if (unionResult) {
        console.log(`Sammenslåing for ${layerName} var vellykket.`);
    } else {
        console.warn(`Sammenslåing for ${layerName} resulterte i et tomt polygon.`);
    }

    return unionResult;
}

/**
 * En sikker differanse-operasjon med feilhåndtering.
 */
function safeDifference(polygon1, polygon2, operationName) {
    if (!polygon1) return null;
    if (!polygon2) return polygon1;
    
    const turf = getTurf();
    try {
        const result = turf.difference(polygon1, polygon2);
        console.log(`${operationName}: Klipping var vellykket.`);
        return result;
    } catch (error) {
        console.error(`Feil under turf.difference for ${operationName}:`, error);
        return polygon1; // Returner det originale polygonet som en fallback
    }
}

/**
 * Bygger globale, ikke-overlappende lag.
 */
function createClippedLayers(featureCollection) {
    // 1. Sorter alle features etter tid
    const featuresByTime = { 5: [], 10: [], 15: [] };
    featureCollection.features.forEach(feature => {
        const minutes = getMinutes(feature);
        if (minutes && featuresByTime[minutes]) {
            featuresByTime[minutes].push(feature);
        }
    });

    // 2. Slå sammen alle features for hver tidsverdi til ett globalt polygon
    const globalUnion5 = robustUnion(featuresByTime[5], '5 minutter');
    const globalUnion10 = robustUnion(featuresByTime[10], '10 minutter');
    const globalUnion15 = robustUnion(featuresByTime[15], '15 minutter');

    // 3. Klipp ut de mindre polygonene fra de større for å lage ringer
    const clippedLayers = [];

    // 15-minutters laget
    let ring15 = safeDifference(globalUnion15, globalUnion10, '15min - 10min');
    if (ring15) clippedLayers.push({ geometry: ring15, minutes: 15 });
    
    // 10-minutters laget
    let ring10 = safeDifference(globalUnion10, globalUnion5, '10min - 5min');
    if (ring10) clippedLayers.push({ geometry: ring10, minutes: 10 });

    // 5-minutters laget (ingen klipping)
    if (globalUnion5) {
        console.log("Legger til 5-minutters laget.");
        clippedLayers.push({ geometry: globalUnion5, minutes: 5 });
    }

    console.log('Totalt antall klippede lag laget:', clippedLayers.length);
    return clippedLayers;
}


/**
 * Henter stil-konfigurasjon for et lag.
 */
function ringStyle(minutes) {
    const color = ISOCHRONE_COLORS[minutes] || ISOCHRONE_COLORS[15];
    return {
        color: color,
        weight: 1,
        opacity: 0.9,
        fillColor: color,
        fillOpacity: 0.5
    };
}

/**
 * Fallback-funksjon for original rendering.
 */
function addIsochronesOriginal(isochroneData, isochroneLayer) {
    console.log("Kjører fallback-rendering.");
    if (!Array.isArray(isochroneData)) return;
    isochroneData.sort((a, b) => (b.aa_mins || 0) - (a.aa_mins || 0));
    isochroneData.forEach((isochrone) => {
        try {
            const geometry = isochrone.GEOM || isochrone.geom;
            if (!geometry) return;
            const minutes = isochrone.aa_mins || isochrone.minutes || 15;
            const style = ringStyle(minutes);
            L.geoJSON(geometry, { style }).addTo(isochroneLayer);
        } catch (error) {
            console.error('Feil under fallback-rendering:', error);
        }
    });
}

/**
 * Setter opp klikk-håndtering for isokron-lagene.
 */
export function setupIsochroneClickHandling(isochroneLayer, map) {
    if (!isochroneLayer || !map) return;
    isochroneLayer.on('click', function(e) {
        const layer = e.layer;
        const minutes = layer.walkingTime || "ukjent";
        const infoPanel = document.getElementById('position-info');
        
        if (infoPanel) {
            infoPanel.innerHTML = `<div style="padding: 10px; background-color: #e9f5ff; border-radius: 4px; margin-bottom: 10px;">
                <h4>Gåavstand</h4>
                <p>${minutes} minutter</p>
            </div>`;
        }
        
        setTimeout(function() {
            map.fire('click', {
                latlng: e.latlng,
                originalEvent: { synthetic: true }
            });
        }, 50);
        
        L.DomEvent.stop(e);
    });
}

/**
 * Hovedfunksjon for å legge til isokroner på kartet.
 */
export function addIsochrones(isochroneData, isochroneLayer) {
    console.log('Starter addIsochrones...');
    if (!isochroneData || (Array.isArray(isochroneData) && !isochroneData.length)) {
        console.warn('Ingen isokron-data å vise.');
        return;
    }
    
    isochroneLayer.clearLayers();
    console.log('Lag tømt for gamle isokroner.');

    try {
        const featureCollection = toFeatureCollection(isochroneData);
        if (!featureCollection.features || featureCollection.features.length === 0) {
            throw new Error("Ingen gyldige features funnet i dataene etter konvertering.");
        }
        
        const clippedLayers = createClippedLayers(featureCollection);

        if (!clippedLayers || clippedLayers.length === 0) {
           throw new Error("Ingen lag kunne bygges fra dataene. Dette kan skyldes feil i geometrien.");
        }

        // Sorter med største minuttverdi først for korrekt tegne-rekkefølge
        clippedLayers.sort((a, b) => b.minutes - a.minutes);
        
        let addedCount = 0;
        clippedLayers.forEach(clippedLayer => {
            if (clippedLayer && clippedLayer.geometry) {
                try {
                    const style = ringStyle(clippedLayer.minutes);
                    const layer = L.geoJSON(clippedLayer.geometry, { style });
                    
                    // Legg til metadata på laget for klikk-hendelser
                    layer.eachLayer(subLayer => {
                        subLayer.walkingTime = clippedLayer.minutes;
                    });
                    
                    layer.addTo(isochroneLayer);
                    addedCount++;
                } catch (error) {
                    console.error(`Klarte ikke å legge til lag for ${clippedLayer.minutes} minutter på kartet:`, error);
                }
            } else {
                console.warn(`Hoppet over et tomt lag for ${clippedLayer.minutes} minutter.`);
            }
        });
        
        if (addedCount > 0) {
            console.log(`Vellykket: La til ${addedCount} klippede isokron-lag på kartet.`);
        } else {
            throw new Error("Ingen lag ble lagt til på kartet. Kjører fallback.");
        }

    } catch (error) {
        console.error('En kritisk feil oppstod under behandling med Turf.js:', error);
        console.log('Faller tilbake til original rendering...');
        addIsochronesOriginal(isochroneData, isochroneLayer);
    }
}