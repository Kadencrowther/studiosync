const { onRequest } = require("firebase-functions/v2/https");
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const admin = require("firebase-admin");
const DATABASE_MAP = require("./databaseMap");

// Initialize Firebase Admin only if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}

// Create Express app
const app = express();

// CORS configuration
app.use(cors({ origin: true }));
app.use(express.json());

// Add a middleware to log all requests and handle CORS
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - Origin: ${req.headers.origin || 'unknown'}`);
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  
  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }
  next();
});

// Create a formatted version of the database structure for the prompt
const formatDatabaseStructure = () => {
    const structure = {
        collections: {},
        fieldRelationships: DATABASE_MAP.fieldRelationships,
        smartQueryTemplates: DATABASE_MAP.smartQueryTemplates,
        relationships: DATABASE_MAP.relationships,
        queryClassificationKeywords: DATABASE_MAP.queryClassificationKeywords
    };

    // Format collections with enhanced information
    Object.entries(DATABASE_MAP.collections.Studios.subCollections).forEach(([collectionName, details]) => {
        structure.collections[collectionName] = {
            description: details.description,
            queryKeywords: details.queryKeywords || [],
            fields: details.fields || {},
            commonFilters: details.commonFilters || {},
            queryPatterns: details.queryPatterns || {},
            subCollections: details.subCollections || {}
        };
    });

    return JSON.stringify(structure, null, 2);
};

// Enhanced system prompt with conversational focus
const SYSTEM_PROMPT = `I am SyncSense, a conversational AI studio management assistant. I help studio owners and staff with their daily operations through natural conversation.

**WHO I AM:**
- I'm a friendly, knowledgeable assistant specializing in studio management across all industries
- I can have casual conversations and provide general advice
- I have access to your studio's database when needed for specific questions
- I understand various studio industries (dance, music, art, martial arts, fitness, etc.) and common challenges

**WHEN I ACCESS THE DATABASE:**
I only query the database for specific data requests like:
- "How many students do we have?"
- "Which classes are full?"
- "Show me unpaid charges"
- "What's our revenue this month?"
- "List all active instructors"

**WHEN I DON'T ACCESS THE DATABASE:**
For casual conversation, introductions, general advice, or explanations:
- "Hello" / "Who are you?" / "How are you?"
- "How should I handle a difficult parent?"
- "What's the best way to market classes?"
- "Explain studio policies"
- General business advice and industry knowledge

**MY CONVERSATIONAL STYLE:**
- Friendly and professional
- Knowledgeable about studio operations across various industries
- Helpful with both data and advice
- I introduce myself when asked
- I engage naturally in conversation
- I adapt my advice based on your studio's industry type

**DATABASE ACCESS:**
When I do need database information, I have access to comprehensive studio data including:
${formatDatabaseStructure()}

I provide natural, helpful responses whether drawing from data or general knowledge, tailored to your specific type of studio.`;

// Improved query classification function
function classifyQuery(query) {
    const queryLower = query.toLowerCase().trim();
    
    // Strong casual indicators (these should NEVER be database queries)
    const strongCasualIndicators = [
        'hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening',
        'who are you', 'what are you', 'introduce yourself', 'tell me about yourself',
        'how are you', 'what\'s up', 'how\'s it going',
        'thank you', 'thanks', 'bye', 'goodbye', 'see you',
        'help', 'what can you do', 'what do you do',
        'how should i', 'what should i', 'advice', 'recommend', 'suggest',
        'explain', 'what is', 'what does', 'define', 'meaning',
        'how to', 'best way', 'tips', 'strategy'
    ];

    // Check for strong casual indicators first
    for (const indicator of strongCasualIndicators) {
        if (queryLower.includes(indicator)) {
            return { type: 'casual', confidence: 10, reason: `Contains casual indicator: "${indicator}"` };
        }
    }

    // Strong database indicators
    const strongDatabaseIndicators = [
        'how many', 'count', 'total', 'sum', 'list', 'show me', 'find', 'get',
        'who owes', 'unpaid', 'balance', 'revenue', 'income', 'charges',
        'which students', 'which classes', 'which families', 'which instructors',
        'full classes', 'available', 'capacity', 'enrollment',
        'this month', 'this week', 'today', 'yesterday', 'last month'
    ];

    // Check for strong database indicators
    for (const indicator of strongDatabaseIndicators) {
        if (queryLower.includes(indicator)) {
            // Also check for collection matches
            const collections = Object.entries(DATABASE_MAP.collections.Studios.subCollections);
            const matchedCollections = [];
            
            collections.forEach(([collectionName, details]) => {
                if (details.queryKeywords) {
                    const matches = details.queryKeywords.filter(keyword => 
                        queryLower.includes(keyword.toLowerCase()));
                    if (matches.length > 0) {
                        matchedCollections.push({
                            collection: collectionName,
                            matches: matches.length,
                            keywords: matches
                        });
                    }
                }
            });

            return { 
                type: 'database', 
                collections: matchedCollections,
                confidence: 10,
                reason: `Contains database indicator: "${indicator}"`
            };
        }
    }

    // Check for collection-specific keywords (medium confidence)
    const collections = Object.entries(DATABASE_MAP.collections.Studios.subCollections);
    const matchedCollections = [];
    
    collections.forEach(([collectionName, details]) => {
        if (details.queryKeywords) {
            const matches = details.queryKeywords.filter(keyword => 
                queryLower.includes(keyword.toLowerCase()));
            if (matches.length > 0) {
                matchedCollections.push({
                    collection: collectionName,
                    matches: matches.length,
                    keywords: matches
                });
            }
        }
    });

    // If we found collection matches, it might be a database query
    if (matchedCollections.length > 0) {
        // But check if it's actually asking for advice about these topics
        const adviceIndicators = ['how to', 'should i', 'best way', 'advice', 'help with', 'tips for'];
        const isAdviceQuery = adviceIndicators.some(indicator => queryLower.includes(indicator));
        
        if (isAdviceQuery) {
            return { 
                type: 'casual', 
                confidence: 7, 
                reason: 'Contains collection keywords but asking for advice, not data'
            };
        }

        return { 
            type: 'database', 
            collections: matchedCollections,
            confidence: 5,
            reason: 'Contains collection-specific keywords'
        };
    }
    
    // Default to casual for unclear queries
    return { 
        type: 'casual', 
        confidence: 1, 
        reason: 'No clear database indicators found, defaulting to casual conversation'
    };
}

// Enhanced contextual data fetching - only for database queries
async function getSmartContextualData(classification, studioId) {
    // Only query database for actual database queries
    if (classification.type === 'casual') {
        console.log('Casual conversation detected - no database access needed');
        return null;
    }
    
    console.log('Database query detected:', classification.reason);
    
    const queries = [];
    const collectionsToQuery = new Set();
    
    // Add collections from classification
    if (classification.collections && classification.collections.length > 0) {
        classification.collections.forEach(match => {
            collectionsToQuery.add(match.collection);
        });
    }
    
    // If no specific collections identified but high confidence database query
    if (collectionsToQuery.size === 0 && classification.confidence >= 8) {
        // Query key collections for general context
        collectionsToQuery.add('Classes');
        collectionsToQuery.add('Students');
        collectionsToQuery.add('Families');
        console.log('High confidence database query but no specific collections - querying key collections');
    }
    
    // If no collections to query, return null (let AI handle without data)
    if (collectionsToQuery.size === 0) {
        console.log('No specific collections identified - AI will handle without database access');
        return null;
    }
    
    // Create optimized queries for each collection
    for (const collectionName of collectionsToQuery) {
        const collectionInfo = DATABASE_MAP.collections.Studios.subCollections[collectionName];
        
        if (!collectionInfo) continue;
        
        // Use query patterns if available
        if (collectionInfo.queryPatterns) {
            Object.entries(collectionInfo.queryPatterns).forEach(([patternName, pattern]) => {
                queries.push({
                    ...pattern,
                    type: pattern.type || "list",
                    collection: collectionName,
                    patternName
                });
            });
        } else {
            // Default query for the collection
            queries.push({
                type: "list",
                collection: collectionName,
                limit: 20 // Smaller limit for efficiency
            });
        }
    }
    
    // Execute queries
    const results = {};
    try {
        for (const query of queries) {
            const data = await queryDatabase(query, studioId);
            const key = query.patternName ? 
                `${query.collection}_${query.patternName}` : 
                query.collection;
            results[key] = data;
        }
        
        console.log('Smart contextual data retrieved for:', Array.from(collectionsToQuery));
        return results;
    } catch (error) {
        console.error('Error fetching smart contextual data:', error);
        return null; // Return null instead of empty object for cleaner handling
    }
}

async function queryDatabase(query, studioId) {
    try {
        const response = await axios.post(
            'https://us-central1-studiosync-af73d.cloudfunctions.net/processDatabaseQuery',
            { query, studioId },
            { headers: { 'Content-Type': 'application/json' } }
        );
        return response.data;
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    }
}

// Enhanced AI query processing
async function queryOpenAI(userMessage, studioId) {
    try {
        const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
        if (!OPENAI_API_KEY) throw new Error("OpenAI API key not configured");

        console.log('Processing query:', userMessage);

        // Classify the query
        const classification = classifyQuery(userMessage);
        console.log('Query classification:', classification);

        let messages = [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMessage }
        ];

        // Only fetch database context for database queries
        if (classification.type === 'database') {
            const contextualData = await getSmartContextualData(classification, studioId);
            
            if (contextualData && Object.keys(contextualData).length > 0) {
                messages.push({
                    role: "assistant", 
                    content: `I've retrieved relevant data from your studio's database. Let me analyze it to answer your question.`
                });
                messages.push({
                    role: "user", 
                    content: `Database context: ${JSON.stringify(contextualData, null, 2)}`
                });
            }
        } else {
            console.log('Casual conversation - proceeding without database access');
        }

        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: "gpt-4-turbo-preview",
                messages: messages,
                max_tokens: 800, // Reduced for efficiency
                temperature: 0.7
            },
            {
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        return response.data.choices[0].message.content;

    } catch (error) {
        console.error("Error processing query:", error);
        
        // More specific error handling
        if (error.response?.status === 429) {
            return "I'm experiencing high demand right now. Please try again in a moment.";
        } else if (error.response?.status === 401) {
            return "I'm having trouble connecting to my AI service. Please contact support.";
        } else {
            return "I apologize, but I encountered an error processing your request. Please try again.";
        }
    }
}

// Main route handler
app.post("/", async (req, res) => {
    try {
        const { query, studioId } = req.body;
        console.log('Received query:', query);
        
        if (!query || !studioId) {
            return res.status(400).send("Query and studioId are required");
        }

        const aiResponse = await queryOpenAI(query, studioId);
        console.log('Sending response back to client');
        
        res.send(aiResponse);

    } catch (error) {
        console.error('Error processing query:', error);
        res.status(500).send("Sorry, I encountered an error processing your request.");
    }
});

// Export the Express app
exports.processSyncSenseQuery = onRequest({
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 30,
    invoker: "public",
    secrets: ["OPENAI_API_KEY"]
}, app); 