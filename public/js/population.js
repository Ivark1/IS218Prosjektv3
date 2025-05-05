document.addEventListener('DOMContentLoaded', function() {
    // Initialize map
    const map = L.map('map').setView([58.65, 7.9], 8);

    // Add base map
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Get population data
    const populationData = window.populationData;
    
    // Calculate total population
    let totalPopulation = 0;
    if (populationData && populationData.features) {
        populationData.features.forEach(feature => {
            if (feature.properties && feature.properties.population) {
                totalPopulation += parseInt(feature.properties.population, 10);
            }
        });
    }
    
    // Add total population info
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

    // Style function 
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

    // Add interaction handlers for each feature
    function onEachFeature(feature, layer) {
        // Create popup content showing the population
        const popupContent = `
            <div class="popup-content">
                <h4>Population Information</h4>
                <p><strong>Population:</strong> ${feature.properties.population.toLocaleString()} people</p>
            </div>
        `;
        
        // Bind popup to the layer
        layer.bindPopup(popupContent);
        
        // Add hover effects
        layer.on({
            // Highlight when mouseover
            mouseover: function(e) {
                const layer = e.target;
                layer.setStyle({
                    weight: 3,
                    color: '#333',
                    fillOpacity: 0.9
                });
                layer.bringToFront();
            },
            // Reset when mouseout
            mouseout: function(e) {
                geoJsonLayer.resetStyle(e.target);
            },
            // Zoom to area when clicked
            click: function(e) {
                map.fitBounds(e.target.getBounds());
            }
        });
    }

    // Define the UTM Zone 33N projection (most common for Norway)
    proj4.defs('EPSG:25833', '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
    
    // Add GeoJSON layer with UTM to WGS84 conversion
    const geoJsonLayer = L.geoJSON(populationData, {
        style: style,
        onEachFeature: onEachFeature,
        coordsToLatLng: function(coords) {
            // Convert from UTM to WGS84
            const wgs84 = proj4('EPSG:25833', 'WGS84', coords);
            // Return as LatLng object (note the order: [lat, lng])
            return new L.LatLng(wgs84[1], wgs84[0]);
        }
    }).addTo(map);
    
    // Fit map to bounds of features
    if (geoJsonLayer.getBounds().isValid()) {
        map.fitBounds(geoJsonLayer.getBounds());
    }
});