var express = require('express');
var router = express.Router();
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client with env variables
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

/* GET population page. */
router.get('/', async function(req, res, next) {
    try {
        // Fetch population data
        const { data: populationData, error: populationError } = await supabase
            .from('populasjon_grunkrets_agder_2024')
            .select('*');
            
        console.log('Population Data Count:', populationData?.length);
        
        // Debug first item if available
        if (populationData && populationData.length > 0) {
            console.log('First population item keys:', Object.keys(populationData[0]));
            
            // Check geometry column structure
            const geomSample = populationData[0].område;
            console.log('Geometry sample type:', typeof geomSample);
            if (typeof geomSample === 'object') {
                console.log('Geometry sample structure:', 
                    JSON.stringify({
                        type: geomSample.type,
                        coordinates_length: geomSample.coordinates ? 
                            (Array.isArray(geomSample.coordinates) ? geomSample.coordinates.length : 'not array') : 
                            'missing'
                    })
                );
            } else if (typeof geomSample === 'string') {
                console.log('Geometry sample (string):', geomSample.substring(0, 100) + '...');
            }
            
            // Check population value
            console.log('Population value sample:', populationData[0].totalBefolkning);
            console.log('Population value type:', typeof populationData[0].totalBefolkning);
        }

        if (populationError) {
            console.error('Population Error:', populationError);
            throw populationError;
        }

        // Add a test polygon for visualization verification
        if (populationData) {
            populationData.push({
                testItem: true,
                område: {
                    type: 'Polygon',
                    coordinates: [
                        [
                            [8.00, 58.16],
                            [8.01, 58.17],
                            [8.02, 58.17],
                            [8.01, 58.16],
                            [8.00, 58.16]
                        ]
                    ]
                },
                totalBefolkning: "999",
                grunnkretsnavn: "Test Area",
                kommunenavn: "Test Kommune"
            });
            console.log('Added test polygon to data');
        }

        res.render('population', {
            title: 'Population Map',
            populationData: JSON.stringify(populationData || [])
        });
    } catch (error) {
        console.error('Error in population route:', error);
        res.render('population', {
            title: 'Population Map - Error',
            populationData: '[]'
        });
    }
});

module.exports = router;