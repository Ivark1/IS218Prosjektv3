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
        // Fetch from first table
        const { data: shelterData, error: shelterError } = await supabase
            .from('osm_shelter_type_basic_hut_agder')
            .select('*')
            .limit(100);

        // Fetch from second table
        const { data: bunkerData, error: bunkerError } = await supabase
            .from('tilfluktsrom_offentlige')
            .select('*')
            .limit(65);

        console.log('Shelter Data Count:', shelterData?.length);
        console.log('Bunker Data Count:', bunkerData?.length);
        console.log('Sample Bunker Data:', bunkerData?.[0]); // Look at structure

        if (shelterError) {
            console.error('Shelter Error:', shelterError);
            throw shelterError;
        }
        if (bunkerError) {
            console.error('Bunker Error:', bunkerError);
            throw bunkerError;
        }

        res.render('index', {
            title: 'Express',
            shelterData: JSON.stringify(shelterData),
            bunkerData: JSON.stringify(bunkerData)
        });
    } catch (error) {
        console.error('Error:', error);
        res.render('index', { title: 'Express' });
    }
});

module.exports = router;