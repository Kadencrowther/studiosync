const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const DATABASE_MAP = require("./databaseMap");

// Initialize Firebase Admin only if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}

async function executeQuery(query, studioId) {
    const db = admin.firestore();
    const studioRef = db.collection('Studios').doc(studioId);

    try {
        console.log('Executing query:', { query, studioId });
        
        let queryRef = studioRef.collection(query.collection);
        
        // If specific fields are requested, use select()
        if (query.fields && query.fields.length > 0) {
            queryRef = queryRef.select(...query.fields);
        }

        // Apply filters
        if (query.filters && query.filters.length > 0) {
            query.filters.forEach(filter => {
                // Skip field-to-field comparisons (handle in memory)
                if (!filter.field2) {
                    queryRef = queryRef.where(filter.field, filter.operator, filter.value);
                }
            });
        }

        // Apply ordering if specified
        if (query.orderBy) {
            queryRef = queryRef.orderBy(query.orderBy.field, query.orderBy.direction);
        }

        // Apply limit if specified
        if (query.limit) {
            queryRef = queryRef.limit(query.limit);
        }

        const snapshot = await queryRef.get();
        
        // Process results based on query type
        switch (query.type) {
            case 'count': {
                if (query.groupBy) {
                    const groups = {};
                    snapshot.docs.forEach(doc => {
                        const data = doc.data();
                        const groupValue = data[query.groupBy];
                        if (groupValue !== undefined) {
                            groups[groupValue] = (groups[groupValue] || 0) + 1;
                        }
                    });
                    return { 
                        groups,
                        total: Object.values(groups).reduce((sum, count) => sum + count, 0)
                    };
                } else {
                    return { total: snapshot.size };
                }
            }

            case 'sum': {
                if (query.groupBy) {
                    const groups = {};
                    snapshot.docs.forEach(doc => {
                        const data = doc.data();
                        const groupValue = data[query.groupBy];
                        const sumValue = data[query.field] || 0;
                        if (groupValue !== undefined) {
                            groups[groupValue] = (groups[groupValue] || 0) + sumValue;
                        }
                    });
                    return { groups };
                } else {
                    const total = snapshot.docs.reduce((sum, doc) => {
                        return sum + (doc.data()[query.field] || 0);
                    }, 0);
                    return { total };
                }
            }

            case 'list': {
                let results = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                
                // Apply field-to-field comparison filters in memory
                if (query.filters) {
                    results = results.filter(data => 
                        query.filters.every(filter => {
                            if (filter.field2) {
                                // Handle field-to-field comparison
                                const value1 = Array.isArray(data[filter.field]) ? 
                                    data[filter.field].length : data[filter.field];
                                const value2 = data[filter.field2];
                                
                                switch (filter.operator) {
                                    case '<': return value1 < value2;
                                    case '<=': return value1 <= value2;
                                    case '>': return value1 > value2;
                                    case '>=': return value1 >= value2;
                                    case '==': return value1 === value2;
                                    case '!=': return value1 !== value2;
                                    default: return true;
                                }
                            }
                            return true; // Already filtered by Firestore query
                        })
                    );
                }
                
                // Apply in-memory ordering for complex fields
                if (query.orderBy && !query.orderBy.field.includes('.')) {
                    results.sort((a, b) => {
                        const aVal = a[query.orderBy.field];
                        const bVal = b[query.orderBy.field];
                        const direction = query.orderBy.direction === 'desc' ? -1 : 1;
                        
                        if (aVal < bVal) return -1 * direction;
                        if (aVal > bVal) return 1 * direction;
                        return 0;
                    });
                }
                
                return { results };
            }

            default:
                throw new Error(`Unsupported query type: ${query.type}`);
        }
    } catch (error) {
        console.error('Error executing query:', error);
        throw error;
    }
}

// Enhanced query validation
function validateQuery(query) {
    if (!query.type || !query.collection) {
        throw new Error("Query must specify type and collection");
    }

    const validTypes = ['count', 'sum', 'list'];
    if (!validTypes.includes(query.type)) {
        throw new Error(`Invalid query type: ${query.type}. Must be one of: ${validTypes.join(', ')}`);
    }

    // Check if collection exists in database map
    const collections = DATABASE_MAP.collections.Studios.subCollections;
    if (!collections[query.collection]) {
        throw new Error(`Unknown collection: ${query.collection}`);
    }

    // Validate fields if specified
    if (query.fields && query.fields.length > 0) {
        const collectionFields = collections[query.collection].fields;
        if (collectionFields) {
            const invalidFields = query.fields.filter(field => !collectionFields[field]);
            if (invalidFields.length > 0) {
                console.warn(`Warning: Unknown fields for ${query.collection}: ${invalidFields.join(', ')}`);
            }
        }
    }

    // Validate filters
    if (query.filters) {
        const validOperators = ['==', '!=', '<', '<=', '>', '>=', 'array-contains', 'array-contains-any', 'in'];
        query.filters.forEach(filter => {
            if (!filter.field || !filter.operator) {
                throw new Error("Each filter must have field and operator");
            }
            if (!validOperators.includes(filter.operator)) {
                throw new Error(`Invalid operator: ${filter.operator}`);
            }
            if (filter.value === undefined && !filter.field2) {
                throw new Error("Filter must have value or field2 for comparison");
            }
        });
    }

    return true;
}

// Helper function to expand query patterns
function expandQueryPattern(patternQuery, collection) {
    const collectionInfo = DATABASE_MAP.collections.Studios.subCollections[collection];
    
    if (!collectionInfo || !collectionInfo.queryPatterns) {
        return patternQuery;
    }

    // If this is a pattern reference, expand it
    if (typeof patternQuery === 'string' && collectionInfo.queryPatterns[patternQuery]) {
        const pattern = collectionInfo.queryPatterns[patternQuery];
        return {
            ...pattern,
            type: pattern.type || 'list',
            collection: collection
        };
    }

    return patternQuery;
}

// Enhanced query processing with smart features
async function processSmartQuery(query, studioId) {
    try {
        // Expand query patterns if needed
        const expandedQuery = expandQueryPattern(query, query.collection);
        
        // Validate the query
        validateQuery(expandedQuery);
        
        // Execute the query
        const result = await executeQuery(expandedQuery, studioId);
        
        // Add metadata about the query
        result.queryInfo = {
            collection: expandedQuery.collection,
            type: expandedQuery.type,
            timestamp: new Date().toISOString(),
            recordCount: result.results ? result.results.length : 
                        result.total ? result.total : 
                        result.groups ? Object.keys(result.groups).length : 0
        };
        
        return result;
        
    } catch (error) {
        console.error('Error in smart query processing:', error);
        throw error;
    }
}

exports.processDatabaseQuery = onRequest({
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 30,
    invoker: "public"
}, async (req, res) => {
    try {
        const { query, studioId } = req.body;

        if (!query || !studioId) {
            return res.status(400).json({
                error: "Missing required parameters: query and studioId"
            });
        }

        // Process the query with enhanced features
        const result = await processSmartQuery(query, studioId);
        
        console.log('Query executed successfully:', {
            collection: query.collection,
            type: query.type,
            recordCount: result.queryInfo.recordCount
        });
        
        res.json(result);

    } catch (error) {
        console.error('Error processing database query:', error);
        res.status(500).json({
            error: "Error processing database query",
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
}); 