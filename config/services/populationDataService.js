/**
 * Database access module for population data
 * Handles fetching and processing population data for TF model
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Class to handle population data for TF model
 */
class PopulationDataService {
    constructor() {
        this.tableName = 'populasjon_grunkrets_agder_2024'; // Assuming this is the table name in Supabase
        this.requiredFeatures = []; // Will be loaded from model_features.csv
    }

    /**
     * Load the required features for the TF model
     * @returns {Promise<Array>} List of required features
     */
    async loadRequiredFeatures() {
        try {
            // Check if features are already loaded
            if (this.requiredFeatures.length > 0) {
                return this.requiredFeatures;
            }

            // Load features from model_features.csv or from web_deployment/features.csv
            const fs = require('fs').promises;
            try {
                const featuresCsv = await fs.readFile('web_deployment/features.csv', 'utf8');
                this.requiredFeatures = featuresCsv
                    .split('\n')
                    .slice(1) // Skip header
                    .filter(line => line.trim() !== '')
                    .map(line => line.trim());
                
                console.log(`Loaded ${this.requiredFeatures.length} required features for TF model`);
                return this.requiredFeatures;
            } catch (err) {
                console.error('Error loading features file:', err);
                // Fallback to hardcoded essential features
                this.requiredFeatures = [
                    'totalBefolkning',
                    'antallMenn',
                    'antallKvinner',
                    'year'
                ];
                console.log(`Using fallback list of ${this.requiredFeatures.length} features`);
                return this.requiredFeatures;
            }
        } catch (error) {
            console.error('Error in loadRequiredFeatures:', error);
            throw error;
        }
    }

    /**
     * Get the latest year of data available
     * @returns {Promise<number>} Latest year
     */
    async getLatestYear() {
        try {
            const { data, error } = await supabase
                .from(this.tableName)
                .select('year')
                .order('year', { ascending: false })
                .limit(1);

            if (error) throw error;
            
            if (data && data.length > 0) {
                return data[0].year;
            }
            
            return new Date().getFullYear() - 1; // Default to previous year
        } catch (error) {
            console.error('Error getting latest year:', error);
            return new Date().getFullYear() - 1; // Default to previous year
        }
    }

    /**
     * Fetch population data for a specific year
     * @param {number} year - Year to fetch data for
     * @returns {Promise<Array>} Population data
     */
    async getPopulationDataForYear(year) {
        try {
            const { data, error } = await supabase
                .from(this.tableName)
                .select('*')
                .eq('year', year);

            if (error) throw error;
            
            console.log(`Fetched ${data.length} population records for year ${year}`);
            return data;
        } catch (error) {
            console.error(`Error fetching population data for year ${year}:`, error);
            throw error;
        }
    }

    /**
     * Get population data required for TF model predictions
     * @param {number} [year] - Optional year to fetch data for (defaults to latest)
     * @returns {Promise<Object>} Processed population data for TF model
     */
    async getDataForTFModel(year = null) {
        try {
            // Load required features
            await this.loadRequiredFeatures();
            
            // Get latest year if not specified
            const targetYear = year || await this.getLatestYear();
            
            // Fetch data
            const populationData = await this.getPopulationDataForYear(targetYear);
            
            // Process data for TF model format
            const processedData = this.processDataForTFModel(populationData);
            
            return {
                year: targetYear,
                data: processedData,
                recordCount: populationData.length
            };
        } catch (error) {
            console.error('Error in getDataForTFModel:', error);
            throw error;
        }
    }

    /**
     * Process raw data into format needed for TF model
     * @param {Array} rawData - Raw population data from database
     * @returns {Object} Processed data ready for TF model
     */
    processDataForTFModel(rawData) {
        try {
            // Extract selected features and handle missing values
            const processed = rawData.map(record => {
                // Create a new object with only the required features
                const processed = {};
                
                // For each record, extract the required features
                this.requiredFeatures.forEach(feature => {
                    if (feature in record) {
                        processed[feature] = record[feature];
                    } else {
                        // Handle missing features with reasonable defaults
                        processed[feature] = this.getDefaultValueForFeature(feature, record);
                    }
                });
                
                // Add identifiers
                processed.grunnkretsnummer = record.grunnkretsnummer;
                processed.kommunenummer = record.kommunenummer;
                processed.grunnkretsnavn = record.grunnkretsnavn || '';
                processed.kommunenavn = record.kommunenavn || '';
                
                return processed;
            });
            
            // Calculate additional derived features needed by the model
            this.calculateDerivedFeatures(processed);
            
            return processed;
        } catch (error) {
            console.error('Error processing data for TF model:', error);
            throw error;
        }
    }

    /**
     * Get a default value for a missing feature
     * @param {string} feature - Feature name
     * @param {Object} record - Current record
     * @returns {number|string} Default value
     */
    getDefaultValueForFeature(feature, record) {
        // Define reasonable defaults based on feature name patterns
        if (feature.startsWith('befolkning') && feature.includes('ratio')) {
            return 0; // Default ratio is 0
        } else if (feature.startsWith('befolkning')) {
            // For age group population, estimate based on total population
            if (record.totalBefolkning) {
                return Math.round(record.totalBefolkning * 0.05); // Rough estimate: 5% of total
            }
            return 0;
        } else if (feature === 'gender_ratio') {
            return 1; // Default gender ratio is 1 (equal males/females)
        } else if (feature.includes('lag1')) {
            // For lagged values, use current values as approximation
            const currentFeature = feature.replace('_lag1', '');
            return record[currentFeature] || 0;
        } else if (feature === 'growth_rate') {
            return 0; // Default growth rate is 0
        } else if (feature === 'pop_change') {
            return 0; // Default population change is 0
        }
        
        return 0; // Default fallback
    }

    /**
     * Calculate derived features needed by the model
     * @param {Array} records - Processed records
     */
    calculateDerivedFeatures(records) {
        // Group records by grunnkretsnummer to handle time-dependent features
        const recordsByGrunnkrets = {};
        records.forEach(record => {
            if (!recordsByGrunnkrets[record.grunnkretsnummer]) {
                recordsByGrunnkrets[record.grunnkretsnummer] = [];
            }
            recordsByGrunnkrets[record.grunnkretsnummer].push(record);
        });
        
        // Calculate derived features for each record
        records.forEach(record => {
            // Calculate age distribution ratios if not already present
            this.calculateAgeDistributionRatios(record);
            
            // Calculate gender ratio if not already present
            if (!record.gender_ratio && record.antallMenn && record.antallKvinner && record.antallKvinner > 0) {
                record.gender_ratio = record.antallMenn / record.antallKvinner;
                // Clip to reasonable range
                record.gender_ratio = Math.max(0.5, Math.min(2, record.gender_ratio));
            } else if (!record.gender_ratio) {
                record.gender_ratio = 1; // Default to 1 if can't calculate
            }
            
            // Calculate age group aggregates
            this.calculateAgeGroupAggregates(record);
        });
    }

    /**
     * Calculate age distribution ratios
     * @param {Object} record - Population record
     */
    calculateAgeDistributionRatios(record) {
        const ageColumns = Object.keys(record).filter(col => 
            col.startsWith('befolkning') && !col.includes('ratio')
        );
        
        ageColumns.forEach(col => {
            const ratioCol = `${col}_ratio`;
            if (!record[ratioCol] && record.totalBefolkning > 0) {
                record[ratioCol] = record[col] / record.totalBefolkning;
                // Clip to range [0, 1]
                record[ratioCol] = Math.max(0, Math.min(1, record[ratioCol]));
            } else if (!record[ratioCol]) {
                record[ratioCol] = 0;
            }
        });
    }

    /**
     * Calculate age group aggregates
     * @param {Object} record - Population record
     */
    calculateAgeGroupAggregates(record) {
        // Children (0-14)
        const childrenCols = ['befolkning0Til04År', 'befolkning05Til09År', 'befolkning10Til14År'];
        let children = 0;
        childrenCols.forEach(col => {
            if (record[col]) children += record[col];
        });
        record.children_0_14 = children;
        record.children_ratio = record.totalBefolkning ? 
            Math.min(1, children / record.totalBefolkning) : 0;
        
        // Elderly (65+)
        const elderlyCols = [
            'befolkning65Til69År', 'befolkning70Til74År', 'befolkning75Til79År', 
            'befolkning80Til84År', 'befolkning85Til89År', 'befolkning90ÅrOgOver'
        ];
        let elderly = 0;
        elderlyCols.forEach(col => {
            if (record[col]) elderly += record[col];
        });
        record.elderly = elderly;
        record.elderly_ratio = record.totalBefolkning ? 
            Math.min(1, elderly / record.totalBefolkning) : 0;
        
        // Working age (20-64)
        const workingAgeCols = [
            'befolkning20Til24År', 'befolkning25Til29År', 'befolkning30Til34År',
            'befolkning35Til39År', 'befolkning40Til44År', 'befolkning45Til49År',
            'befolkning50Til54År', 'befolkning55Til59År', 'befolkning60Til64År'
        ];
        let workingAge = 0;
        workingAgeCols.forEach(col => {
            if (record[col]) workingAge += record[col];
        });
        record.working_age = workingAge;
        record.working_age_ratio = record.totalBefolkning ? 
            Math.min(1, workingAge / record.totalBefolkning) : 0;
    }

    /**
     * Save population prediction results back to Supabase
     * @param {Array} predictions - Prediction results
     * @param {number} year - Year of predictions
     * @returns {Promise<Object>} Result of save operation
     */
    async savePredictions(predictions, year) {
        try {
            // Format predictions for database storage
            const formattedPredictions = predictions.map(pred => ({
                grunnkretsnummer: pred.grunnkretsnummer,
                kommunenummer: pred.kommunenummer,
                year: year,
                totalBefolkning: Math.round(pred.new_totalBefolkning || pred.predicted_population),
                folketilvekst: Math.round(pred.predicted_growth || 0),
                antallMenn: pred.new_antallMenn ? Math.round(pred.new_antallMenn) : null,
                antallKvinner: pred.new_antallKvinner ? Math.round(pred.new_antallKvinner) : null,
                // Add additional demographic fields as needed
                prediction_date: new Date().toISOString().split('T')[0]
            }));
            
            // Store in a predictions table
            const { data, error } = await supabase
                .from('population_predictions')
                .upsert(formattedPredictions, { 
                    onConflict: 'grunnkretsnummer,year',
                    returning: 'minimal'
                });
                
            if (error) throw error;
            
            return {
                success: true,
                count: formattedPredictions.length,
                year: year
            };
        } catch (error) {
            console.error(`Error saving predictions for year ${year}:`, error);
            return {
                success: false,
                error: error.message,
                year: year
            };
        }
    }
}

module.exports = new PopulationDataService();