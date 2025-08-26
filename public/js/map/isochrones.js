/**
 * Isochrones-modul
 * Viser isokroner ved hjelp av en Canvas-renderer for å unngå visuell overlapping.
 */

export const ISOCHRONE_COLORS = {
    5: '#A2E05E',
    10: '#5B9A4C',
    15: '#2E6B5A'
};

function getMinutes(feature) {
    const props = feature.properties || {};
    const candidates = [props.minutes, props.walkingTime, props.aa_mins, props.time, props.mins];
    for (const candidate of candidates) {
        if (typeof candidate === 'number' && candidate > 0) {
            return candidate;
        }
    }
    return null;
}

/**
 * Definerer stilen for hvert polygon.
 * VIKTIG: fillOpacity er satt til 1.0 (helt solid) for at
 * de øverste lagene skal male fullstendig over de under.
 */
function isochroneStyle(minutes) {
    const color = ISOCHRONE_COLORS[minutes] || ISOCHRONE_COLORS[15];
    return {
        color: color,
        weight: 1,
        opacity: 1,       // Solid kantlinje
        fillColor: color,
        fillOpacity: 1.0  // HELT SOLID fyllfarge
    };
}

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
        
        setTimeout(() => map.fire('click', { latlng: e.latlng, originalEvent: { synthetic: true } }), 50);
        L.DomEvent.stop(e);
    });
}

/**
 * Hovedfunksjon for å legge til isokroner på kartet.
 */
export function addIsochrones(isochroneData, isochroneLayer) {
    console.log('Starter addIsochrones med Canvas-metoden...');
    if (!isochroneData || !Array.isArray(isochroneData) || isochroneData.length === 0) {
        console.warn('Ingen isokron-data å vise.');
        return;
    }
    
    isochroneLayer.clearLayers();

    // Sorter dataene slik at de største polygonene (15 min) tegnes FØRST,
    // og de minste (5 min) tegnes SIST (og dermed havner øverst).
    isochroneData.sort((a, b) => {
        const minsA = a.aa_mins || a.minutes || 0;
        const minsB = b.aa_mins || b.minutes || 0;
        return minsB - minsA;
    });

    // Legg til hvert polygon på kartet. 
    isochroneData.forEach(data => {
        const geometry = data.GEOM || data.geom;
        if (!geometry) return;

        const minutes = getMinutes({ properties: data });
        const style = isochroneStyle(minutes);
        
        const layer = L.geoJSON({ type: 'Feature', geometry: geometry }, { style });
        
        // Legg til data for klikk-håndtering
        layer.eachLayer(subLayer => {
            subLayer.walkingTime = minutes;
        });

        layer.addTo(isochroneLayer);
    });

    //Gjør hele canvas-lerretet gjennomsiktig
    try {
        isochroneLayer.getPane().style.opacity = 0.6; // Juster verdien mellom 0.0 og 1.0
        console.log("Vellykket: Viser isokroner uten overlapp ved hjelp av Canvas.");
    } catch (e) {
        console.error("Kunne ikke sette gjennomsiktighet på laget. Er laget lagt til på kartet?", e);
    }
}