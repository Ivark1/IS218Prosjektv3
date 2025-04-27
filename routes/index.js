var express = require('express');
var router = express.Router();
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client with env variables
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

router.get('/', async function (req, res, next) {
    try {
        // Fetch from shelter table
        const { data: shelterData, error: shelterError } = await supabase
            .from('osm_shelter_type_basic_hut_agder')
            .select('*')
            .limit(100);

        // Fetch from bunker table
        const { data: bunkerData, error: bunkerError } = await supabase
            .from('tilfluktsrom_offentlige')
            .select('*')
            .limit(65);
            
        // Fetch from population table
        const { data: populationData, error: populationError } = await supabase
            .from('befolkning_agder')
            .select('*');
            
        // Fetch isochrone data
        const { data: isochroneData, error: isochroneError } = await supabase
            .from('public_shelter_iso')
            .select('*');

        console.log('Shelter Data Count:', shelterData?.length);
        console.log('Bunker Data Count:', bunkerData?.length);
        console.log('Population Data Count:', populationData?.length);
        console.log('Isochrone Data Count:', isochroneData?.length);

        if (shelterError) {
            console.error('Shelter Error:', shelterError);
            throw shelterError;
        }
        if (bunkerError) {
            console.error('Bunker Error:', bunkerError);
            throw bunkerError;
        }
        if (populationError) {
            console.error('Population Error:', populationError);
            throw populationError;
        }
        if (isochroneError) {
            console.error('Isochrone Error:', isochroneError);
            throw isochroneError;
        }

        res.render('index', {
            title: 'Express',
            shelterData: JSON.stringify(shelterData),
            bunkerData: JSON.stringify(bunkerData),
            populationData: JSON.stringify(populationData),
            isochroneData: JSON.stringify(isochroneData)
        });
    } catch (error) {
        console.error('Error:', error);
        res.render('index', { title: 'Express' });
    }
});

module.exports = router;