document.addEventListener('DOMContentLoaded', function () {
    try {
      // Sjekker om Proj4js er lastet - Proj4js library blir hentet i index.pug
      if (typeof proj4 === 'undefined') {
        console.error('Proj4js library not loaded! Please add the script tag in your HTML.');
        return;
      }
      
      // Definerer projeksjonen for Norge - UTM Sone 32N (EPSG:25832)
      proj4.defs('EPSG:25832', '+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
      
      L.Icon.Default.imagePath = 'https://unpkg.com/leaflet@1.9.4/dist/images/';
      const map = L.map('map').setView([58.163576619299235, 8.003306530291821], 13);
      
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
      }).addTo(map);
      
      // Create layer groups to hold our markers
      const shelterLayer = L.layerGroup().addTo(map);
      const bunkerLayer = L.layerGroup().addTo(map);
      
      // Add shelter points (blue markers - default)
      if (window.shelterData && window.shelterData.length > 0) {
        window.shelterData.forEach(point => {
          if (point.geom && point.geom.coordinates) {
            const coordinates = point.geom.coordinates;
            L.marker([coordinates[1], coordinates[0]])
              .addTo(shelterLayer)
              .bindPopup('Shelter');
          }
        });
      }
      
      // Add bunker points (red markers)
      if (window.bunkerData && window.bunkerData.length > 0) {
        window.bunkerData.forEach((point, index) => {
          if (point.geom && point.geom.coordinates) {
            try {
              const utmEasting = point.geom.coordinates[0];
              const utmNorthing = point.geom.coordinates[1];
              // Konverterer fra UTM Sone 32N til WGS84
              const wgs84Coords = proj4('EPSG:25832', 'WGS84', [utmEasting, utmNorthing]);
              const lat = wgs84Coords[1];
              const lng = wgs84Coords[0];
              
              const marker = L.marker([lat, lng], {
                icon: L.icon({
                  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
                  iconSize: [25, 41],
                  iconAnchor: [12, 41],
                  popupAnchor: [1, -34],
                  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                  shadowSize: [41, 41],
                  shadowAnchor: [12, 41]
                })
              }).addTo(bunkerLayer)
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
      
      // Create custom control for layer selection
      const layerControl = L.control({position: 'topright'});
      
      layerControl.onAdd = function(map) {
        const div = L.DomUtil.create('div', 'layer-control');
        div.innerHTML = `
          <div style="background: white; padding: 10px; border-radius: 5px; box-shadow: 0 1px 5px rgba(0,0,0,0.4);">
            <h4 style="margin: 0 0 5px 0;">Velg Shelters eller Tilfuktsrom for å se hvor de er</h4>
            <div>
              <label>
                <input type="checkbox" id="shelter-checkbox" checked>
                Shelters (Blå)
              </label>
            </div>
            <div>
              <label>
                <input type="checkbox" id="bunker-checkbox" checked>
                Tilfluktsrom (Rød)
              </label>
            </div>
          </div>
        `;
        
        // Prevent map clicks from propagating through the control
        L.DomEvent.disableClickPropagation(div);
        
        return div;
      };
      
      layerControl.addTo(map);
      
      // Add event listeners to checkboxes
      setTimeout(() => {
        document.getElementById('shelter-checkbox').addEventListener('change', function(e) {
          if (e.target.checked) {
            map.addLayer(shelterLayer);
          } else {
            map.removeLayer(shelterLayer);
          }
        });
        
        document.getElementById('bunker-checkbox').addEventListener('change', function(e) {
          if (e.target.checked) {
            map.addLayer(bunkerLayer);
          } else {
            map.removeLayer(bunkerLayer);
          }
        });
      }, 200);
      
      // Ensure map renders correctly
      setTimeout(() => {
        map.invalidateSize();
      }, 100);
      
    } catch (error) {
      console.error('Map initialization error:', error);
    }
  });