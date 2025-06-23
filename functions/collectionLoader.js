// Smart Collection Loader for Database Queries
const MAIN_DATABASE_MAP = require('./databaseMapMain');

// Function to determine which collections are needed based on user query
function identifyNeededCollections(userQuery) {
    const queryLower = userQuery.toLowerCase();
    const neededCollections = [];
    
    // Check each collection's keywords against the query
    Object.entries(MAIN_DATABASE_MAP.queryKeywords).forEach(([collection, keywords]) => {
        const hasMatch = keywords.some(keyword => queryLower.includes(keyword.toLowerCase()));
        if (hasMatch) {
            neededCollections.push(collection);
        }
    });
    
    // If no specific matches, try to infer from common patterns
    if (neededCollections.length === 0) {
        if (queryLower.includes('how many') || queryLower.includes('count')) {
            neededCollections.push('Students', 'Classes'); // Most common counts
        }
        if (queryLower.includes('revenue') || queryLower.includes('money')) {
            neededCollections.push('Payments', 'Charges');
        }
        if (queryLower.includes('schedule') || queryLower.includes('today')) {
            neededCollections.push('Classes');
        }
    }
    
    return [...new Set(neededCollections)]; // Remove duplicates
}

// Function to load specific collection maps
function loadCollectionMaps(collections) {
    const collectionMaps = {};
    
    collections.forEach(collection => {
        try {
            // Try to load the collection-specific map
            const collectionMap = require(`./collections/${collection}`);
            collectionMaps[collection] = collectionMap;
        } catch (error) {
            console.warn(`Collection map not found for ${collection}, using basic info`);
            // Fallback to basic info from main map
            collectionMaps[collection] = {
                collection: collection,
                description: MAIN_DATABASE_MAP.collections[collection] || "Collection description not available",
                note: "Detailed map not available - using basic information"
            };
        }
    });
    
    return collectionMaps;
}

// Main function to get relevant database context for a query
function getRelevantDatabaseContext(userQuery) {
    console.log('Analyzing query for database context:', userQuery);
    
    // Step 1: Identify which collections are needed
    const neededCollections = identifyNeededCollections(userQuery);
    console.log('Identified needed collections:', neededCollections);
    
    if (neededCollections.length === 0) {
        console.log('No specific collections identified');
        return null;
    }
    
    // Step 2: Load only the relevant collection maps
    const relevantMaps = loadCollectionMaps(neededCollections);
    
    // Step 3: Create focused context
    const context = {
        queryAnalysis: `Based on your query "${userQuery}", I need to access: ${neededCollections.join(', ')}`,
        relevantCollections: relevantMaps,
        availableQueryTypes: ["count", "list", "sum"],
        instructions: "Create appropriate database queries using the collection information above."
    };
    
    return context;
}

module.exports = {
    identifyNeededCollections,
    loadCollectionMaps, 
    getRelevantDatabaseContext
}; 