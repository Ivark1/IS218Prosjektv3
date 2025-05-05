const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

// Simple prediction model (simplified for demonstration)
function predictPopulation(currentPopulation, year, baseYear = 2024) {
    // Simple growth model: average annual growth rate in Norway is about 0.8%
    const growthRate = 0.008; 
    const years = year - baseYear;
    const predictedPopulation = Math.round(currentPopulation * Math.pow(1 + growthRate, years));
    const predictedGrowth = predictedPopulation - currentPopulation;
    const growthPercentage = (predictedGrowth / currentPopulation) * 100;
    
    return {
        predictedPopulation,
        predictedGrowth,
        growthPercentage
    };
}

// API endpoint for population predictions
router.post('/predict', async (req, res) => {
    try {
        const { grunnkretsnummer, year } = req.body;
        
        if (!grunnkretsnummer || !year) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }
        
        // Fetch current population data for the area
        const { data, error } = await supabase
            .from('grunnkrets_populasjon_agder_2024')
            .select('totalBefolkning')
            .eq('grunnkretsnummer', grunnkretsnummer)
            .single();
            
        if (error) {
            console.error('Error fetching population data:', error);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (!data) {
            return res.status(404).json({ error: 'Area not found' });
        }
        
        // Get current population
        const currentPopulation = parseInt(data.totalBefolkning) || 0;
        
        // Check if population is less than 10
        if (currentPopulation < 10) {
            return res.status(400).json({ 
                error: 'Population too small for prediction',
                message: 'The selected area has fewer than 10 residents, which is too small for reliable prediction.'
            });
        }
        
        // Generate prediction
        const prediction = predictPopulation(currentPopulation, year);
        
        res.json(prediction);
    } catch (err) {
        console.error('Prediction error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;