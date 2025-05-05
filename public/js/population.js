document.addEventListener('DOMContentLoaded', function() {
    // Initialize the map
    const map = L.map('map').setView([58.65, 7.9], 8);
    
    // Add the base tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    
    // Initialize population data from global variable
    const populationData = window.populationData ? JSON.parse(window.populationData) : null;
    
    // Calculate total population if data is available
    let totalPopulation = 0;
    if (populationData && populationData.features) {
      populationData.features.forEach(feature => {
        if (feature.properties && feature.properties.population) {
          totalPopulation += parseInt(feature.properties.population, 10);
        }
      });
      console.log(`Calculated total population: ${totalPopulation} from ${populationData.features.length} features`);
    } else {
      console.warn('No population data available or data is invalid');
    }
    
    // Add an info control to display total population
    const info = L.control();
    info.onAdd = function() {
      const div = L.DomUtil.create('div', 'info');
      div.innerHTML = `<h4>Total Befolkning</h4><b>${totalPopulation.toLocaleString()}</b>`;
      div.style.background = 'white';
      div.style.padding = '10px';
      div.style.borderRadius = '5px';
      return div;
    };
    info.addTo(map);
    
    // Style function for the GeoJSON features
    function style(feature) {
      const population = feature.properties && feature.properties.population ?
        parseInt(feature.properties.population, 10) : 0;
      const color =
        population > 1000 ? '#BD0026' :
        population > 500 ? '#FC4E2A' :
        population > 100 ? '#FD8D3C' :
        population > 10 ? '#FEB24C' : '#FFEDA0';
      return {
        fillColor: color,
        weight: 1,
        opacity: 0.5,
        color: '#666',
        fillOpacity: 0.25
      };
    }
    
    // Track the currently selected layer and feature
    let selectedLayer = null;
    let selectedFeature = null;
    const predictionPanel = document.querySelector('.prediction-panel');
    const predictionForm = document.getElementById('prediction-form');
    const selectedAreaText = document.getElementById('selected-area');
    const predictionResults = document.getElementById('prediction-results');
    
    // Add interactivity to each GeoJSON feature
    function onEachFeature(feature, layer) {
      // Create popup content
      const popupContent = `
        <div class="popup-content">
          <h4>Befolkningsinformasjon</h4>
          <p><strong>Område:</strong> ${feature.properties.name || 'Ukjent område'}</p>
          <p><strong>Befolkning:</strong> ${feature.properties.population.toLocaleString()} mennesker</p>
          <p><strong>Grunnkretsnummer:</strong> ${feature.properties.grunnkretsnummer || 'Ukjent'}</p>
        </div>
      `;
      layer.bindPopup(popupContent);
      
      // Add mouseover, mouseout, and click events
      layer.on({
        mouseover: function(e) {
          // Only highlight if this is not the selected layer
          if (selectedLayer !== e.target) {
            const layer = e.target;
            layer.setStyle({
              weight: 3,
              color: '#333',
              fillOpacity: 0.4
            });
            layer.bringToFront();
          }
        },
        mouseout: function(e) {
          // Only reset style if this is not the selected layer
          if (selectedLayer !== e.target) {
            geoJsonLayer.resetStyle(e.target);
          }
        },
        click: function(e) {
          // Remove highlight from previously selected layer
          if (selectedLayer) {
            geoJsonLayer.resetStyle(selectedLayer);
          }
          
          // Set this as the new selected layer
          selectedLayer = e.target;
          selectedFeature = feature;
          
          // Apply bold border style
          selectedLayer.setStyle({
            weight: 3,
            color: '#333',
            fillOpacity: 0.7
          });
          
          // Bring to front
          selectedLayer.bringToFront();
          
          // Open popup
          layer.openPopup();
          
          // Show prediction panel and update selected area text
          if (predictionPanel) {
            predictionPanel.style.display = 'block';
            selectedAreaText.textContent = `You've selected: ${feature.properties.name || 'Area'} (Current population: ${feature.properties.population.toLocaleString()})`;
            
            // Hide previous prediction results if any
            if (predictionResults) {
              predictionResults.style.display = 'none';
            }
          }
        }
      });
    }
    
    // Initialize the GeoJSON layer if data is available
    let geoJsonLayer = null;
    if (populationData && populationData.features && populationData.features.length > 0) {
      console.log('Creating GeoJSON layer with population data');
      
      geoJsonLayer = L.geoJSON(populationData, {
        style: style,
        onEachFeature: onEachFeature
      }).addTo(map);
      
      // Fit the map to the bounds of the GeoJSON layer
      if (geoJsonLayer.getBounds().isValid()) {
        map.fitBounds(geoJsonLayer.getBounds());
      }
    } else {
      console.error('No valid population data available for creating GeoJSON layer');
      
      // Show error message on the map
      const errorDiv = document.createElement('div');
      errorDiv.className = 'map-error';
      errorDiv.textContent = 'Could not load population data. Please try refreshing the page.';
      document.querySelector('.map-container').appendChild(errorDiv);
    }
    
    // Add event listener for prediction form submission
    if (predictionForm) {
      predictionForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        if (!selectedFeature) {
          alert('Please select an area on the map first.');
          return;
        }
        
        const year = document.getElementById('prediction-year').value;
        
        // Show loading indicator
        const submitButton = predictionForm.querySelector('button[type="submit"]');
        const originalButtonText = submitButton.textContent;
        submitButton.textContent = 'Loading...';
        submitButton.disabled = true;
        
        // Make AJAX request to get prediction
        fetch('/api/predict', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            grunnkretsnummer: selectedFeature.properties.grunnkretsnummer || '0000',
            year: parseInt(year)
          })
        })
        .then(response => {
          if (!response.ok) {
            return response.json().then(err => {
              throw new Error(err.message || err.error || 'Server error');
            });
          }
          return response.json();
        })
        .then(data => {
          console.log('Prediction data:', data);
          
          // Show prediction results
          document.getElementById('population-value').textContent = `Predicted population in ${year}: ${data.predictedPopulation.toLocaleString()}`;
          
          // Format growth with + sign for positive values
          const growthText = `${data.predictedGrowth > 0 ? '+' : ''}${data.predictedGrowth.toLocaleString()} (${data.growthPercentage.toFixed(2)}%)`;
          document.getElementById('growth-value').textContent = `Predicted growth: ${growthText}`;
          
          // Show results section
          predictionResults.style.display = 'block';
          
          // Reset button
          submitButton.textContent = originalButtonText;
          submitButton.disabled = false;
        })
        .catch(error => {
          console.error('Error fetching prediction:', error);
          alert(`Error: ${error.message || 'Failed to fetch prediction. Please try again.'}`);
          
          // Reset button
          submitButton.textContent = originalButtonText;
          submitButton.disabled = false;
        });
      });
    }
});