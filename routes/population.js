const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const proj4 = require('proj4');
require('dotenv').config();

// Initialize Supabase client with env variables
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

// Define the UTM Zone 33N (EPSG:25833) projection
proj4.defs('EPSG:25833', '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');

// Helper function to convert UTM coordinates to WGS84 (lat/lng)
function convertUTMToWGS84(utmEasting, utmNorthing) {
    try {
        const wgs84 = proj4('EPSG:25833', 'WGS84', [utmEasting, utmNorthing]);
        return { lng: wgs84[0], lat: wgs84[1] }; // Return as {lng, lat} object
    } catch (error) {
        console.error('Error converting coordinates:', error);
        return null;
    }
}

router.get('/', async function (req, res, next) {
    try {
        console.log('Population route called');
        
        // Query the database using the exact table and columns specified
        console.log('Querying database table: grunnkrets_populasjon_agder_2024');
        const { data, error } = await supabase
            .from('grunnkrets_populasjon_agder_2024')
            .select('geojson_geometry, "totalBefolkning", grunnkretsnummer, grunnkretsnavn, kommunenummer, kommunenavn');

        if (error) {
            console.error('Database error:', error);
            throw error;
        }

        console.log(`Retrieved ${data?.length || 0} rows from database`);
        
        if (!data || data.length === 0) {
            console.error('No data returned from database');
            throw new Error('No population data found');
        }

        // Log sample of first row
        if (data[0]) {
            console.log('First row sample:');
            console.log('totalBefolkning:', data[0].totalBefolkning);
            console.log('geojson_geometry type:', typeof data[0].geojson_geometry);
            // Don't log the full geometry as it might be large
            if (typeof data[0].geojson_geometry === 'string') {
                console.log('geojson_geometry is a string, needs parsing');
            } else if (typeof data[0].geojson_geometry === 'object') {
                console.log('geojson_geometry is already an object');
                if (data[0].geojson_geometry && data[0].geojson_geometry.type) {
                    console.log('geometry type:', data[0].geojson_geometry.type);
                } else {
                    console.log('geometry object does not have a type property');
                }
            }
        }

        // Create GeoJSON features
        console.log('Creating GeoJSON features');
        const features = [];
        let successCount = 0;
        let errorCount = 0;
        
        for (let i = 0; i < data.length; i++) {
            const item = data[i];
            try {
                // Parse geometry if it's a string
                let geometry;
                if (typeof item.geojson_geometry === 'string') {
                    try {
                        geometry = JSON.parse(item.geojson_geometry);
                    } catch (e) {
                        console.error(`Error parsing geometry string for item ${i}:`, e);
                        errorCount++;
                        continue;
                    }
                } else {
                    geometry = item.geojson_geometry;
                }
                
                // Validate geometry
                if (!geometry || !geometry.type || !geometry.coordinates) {
                    console.error(`Item ${i} has invalid geometry:`, geometry);
                    errorCount++;
                    continue;
                }
                
                // Check a coordinates sample
                if (i < 3) {
                    console.log(`Item ${i} geometry type: ${geometry.type}`);
                    console.log(`Item ${i} coordinates sample:`, 
                        geometry.coordinates.length > 0 ? 
                            (geometry.coordinates[0].length > 0 ? 
                                geometry.coordinates[0][0] : 'empty') : 'empty');
                }
                
                // Convert UTM coordinates to WGS84 for GeoJSON
                let convertedGeometry = null;
                
                if (geometry.type === 'Polygon') {
                    // For polygon, convert each coordinate in each ring
                    convertedGeometry = {
                        type: 'Polygon',
                        coordinates: []
                    };
                    
                    for (const ring of geometry.coordinates) {
                        const convertedRing = [];
                        for (const coord of ring) {
                            // Check if coordinates need UTM conversion (assume UTM if x > 180)
                            if (coord[0] > 180 || coord[1] > 90) {
                                const wgs84 = convertUTMToWGS84(coord[0], coord[1]);
                                if (wgs84) {
                                    convertedRing.push([wgs84.lng, wgs84.lat]);
                                }
                            } else {
                                convertedRing.push(coord); // Already in WGS84
                            }
                        }
                        
                        if (convertedRing.length > 2) { // Need at least 3 points for a valid ring
                            convertedGeometry.coordinates.push(convertedRing);
                        }
                    }
                } else if (geometry.type === 'MultiPolygon') {
                    // For multipolygon, convert each coordinate in each polygon in each ring
                    convertedGeometry = {
                        type: 'MultiPolygon',
                        coordinates: []
                    };
                    
                    for (const polygon of geometry.coordinates) {
                        const convertedPolygon = [];
                        for (const ring of polygon) {
                            const convertedRing = [];
                            for (const coord of ring) {
                                // Check if coordinates need UTM conversion
                                if (coord[0] > 180 || coord[1] > 90) {
                                    const wgs84 = convertUTMToWGS84(coord[0], coord[1]);
                                    if (wgs84) {
                                        convertedRing.push([wgs84.lng, wgs84.lat]);
                                    }
                                } else {
                                    convertedRing.push(coord); // Already in WGS84
                                }
                            }
                            
                            if (convertedRing.length > 2) { // Need at least 3 points for a valid ring
                                convertedPolygon.push(convertedRing);
                            }
                        }
                        
                        if (convertedPolygon.length > 0) {
                            convertedGeometry.coordinates.push(convertedPolygon);
                        }
                    }
                }
                
                // Skip if no valid converted geometry
                if (!convertedGeometry || convertedGeometry.coordinates.length === 0) {
                    console.warn(`Item ${i} has no valid converted coordinates`);
                    errorCount++;
                    continue;
                }
                
                // Parse population
                let population = 0;
                if (typeof item.totalBefolkning === 'string') {
                    population = parseInt(item.totalBefolkning.trim(), 10) || 0;
                } else if (typeof item.totalBefolkning === 'number') {
                    population = item.totalBefolkning;
                }
                
                // Create feature
                const feature = {
                    type: 'Feature',
                    properties: {
                        population: population,
                        grunnkretsnummer: item.grunnkretsnummer,
                        name: item.grunnkretsnavn || ''
                    },
                    geometry: convertedGeometry
                };
                
                features.push(feature);
                successCount++;
                
                if (successCount % 100 === 0) {
                    console.log(`Processed ${successCount} features successfully`);
                }
            } catch (e) {
                console.error(`Error processing item ${i}:`, e);
                errorCount++;
            }
        }
        
        console.log(`GeoJSON creation complete. Success: ${successCount}, Errors: ${errorCount}`);
        
        // Create GeoJSON object
        const geojsonData = {
            type: 'FeatureCollection',
            features: features
        };
        
        // Check if we have valid data
        if (features.length === 0) {
            console.error('No valid features created');
            throw new Error('Failed to create valid GeoJSON');
        }
        
        console.log(`Created GeoJSON with ${features.length} features`);

        // Render the page with data
        res.render('population', {
            title: 'Population Map',
            populationData: JSON.stringify(geojsonData)
        });
        console.log('Population page rendered');
    } catch (err) {
        console.error('Error in population route:', err);
        // Still render the page but with empty data
        res.render('population', {
            title: 'Population Map - Error',
            populationData: 'null'
        });
        console.log('Error page rendered');
    }
});

module.exports = router;