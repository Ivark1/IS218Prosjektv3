document.addEventListener('DOMContentLoaded', function() {
    const map = L.map('map').setView([58.65, 7.9], 8);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    const populationData = window.populationData;
    
    let totalPopulation = 0;
    if (populationData && populationData.features) {
        populationData.features.forEach(feature => {
            if (feature.properties && feature.properties.population) {
                totalPopulation += parseInt(feature.properties.population, 10);
            }
        });
    }
    
    const info = L.control();
    info.onAdd = function() {
        const div = L.DomUtil.create('div', 'info');
        div.innerHTML = `<h4>Total Population</h4><b>${totalPopulation.toLocaleString()}</b>`;
        div.style.background = 'white';
        div.style.padding = '10px';
        div.style.borderRadius = '5px';
        return div;
    };
    info.addTo(map);

    function style(feature) {
        const population = feature.properties && feature.properties.population ? 
                         parseInt(feature.properties.population, 10) : 0;
        
        const color = 
            population > 2000 ? '#BD0026' :
            population > 1000 ? '#FC4E2A' :
            population > 500  ? '#FD8D3C' :
            population > 100  ? '#FEB24C' : '#FFEDA0';
            
        return {
            fillColor: color,
            weight: 1,
            opacity: 0.7,
            color: '#666',
            fillOpacity: 0.7
        };
    }

    function onEachFeature(feature, layer) {
        const popupContent = `
            <div class="popup-content">
                <h4>Population Information</h4>
                <p><strong>Population:</strong> ${feature.properties.population.toLocaleString()} people</p>
            </div>
        `;
        
        layer.bindPopup(popupContent);
        
        layer.on({
            mouseover: function(e) {
                const layer = e.target;
                layer.setStyle({
                    weight: 3,
                    color: '#333',
                    fillOpacity: 0.9
                });
                layer.bringToFront();
            },
            mouseout: function(e) {
                geoJsonLayer.resetStyle(e.target);
            },
            click: function(e) {
                map.fitBounds(e.target.getBounds());
            }
        });
    }

    proj4.defs('EPSG:25833', '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
    
    const geoJsonLayer = L.geoJSON(populationData, {
        style: style,
        onEachFeature: onEachFeature,
        coordsToLatLng: function(coords) {
            const wgs84 = proj4('EPSG:25833', 'WGS84', coords);
            return new L.LatLng(wgs84[1], wgs84[0]);
        }
    }).addTo(map);
    
    if (geoJsonLayer.getBounds().isValid()) {
        map.fitBounds(geoJsonLayer.getBounds());
    }
});
