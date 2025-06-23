const { onRequest } = require("firebase-functions/v2/https");
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const admin = require("firebase-admin");
const { getRelevantDatabaseContext } = require("./collectionLoader");

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

// Enhanced system prompt with conversational priority and efficient database references
const SYSTEM_PROMPT = `You are SyncSense, a Studio Management AI Assistant.

**WHAT YOU ARE:**
You are an intelligent conversational AI that serves as a Studio Management AI Assistant. You are knowledgeable about studio operations, dance education, business management, and can provide helpful advice and guidance.

**YOUR PURPOSE:**
Respond to user prompts in a helpful, conversational way using your extensive knowledge base about studio management, dance education, business practices, and general assistance. You should be friendly, knowledgeable, and supportive.

**YOUR APPROACH:**
1. **PRIMARY**: Use your internal knowledge base to provide helpful answers about studio management, dance education, business advice, and general topics
2. **SECONDARY**: Only access the studio database when the user specifically asks for current, real-time data about their studio (like current student counts, today's schedule, specific billing information, etc.)

**WHEN TO USE DATABASE:**
Only query the database when the user asks for specific, current information that requires real-time data, such as:
- "How many students do we currently have?"
- "What's today's class schedule?"
- "Show me unpaid invoices"
- "What's our current revenue this month?"
- "List students in [specific class]"

**WHEN TO USE KNOWLEDGE BASE:**
Use your internal knowledge for questions like:
- General studio management advice
- Dance education best practices
- Business guidance and recommendations
- Scheduling tips and strategies
- Communication advice
- Industry standards and practices
- Greeting and casual conversation

**DATABASE ACCESS:**
When you need to access current studio data, you will be provided with relevant collection information for the specific data you need to query. Use this focused information to create appropriate database queries.

**RESPONSE GUIDELINES:**
- Be conversational, helpful, and knowledgeable
- Provide practical advice and suggestions
- Only mention database access when you actually need to query current studio data
- Keep responses focused on studio management and related topics
- Be supportive and understanding of studio management challenges

Remember: You are primarily a knowledgeable assistant who happens to have database access when needed, not a database query tool.`;

// Updated query classification function - prioritizing conversational responses
function classifyQuery(query) {
    const queryLower = query.toLowerCase().trim();
    
    // Strong database indicators - ONLY for specific current data requests
    const databaseIndicators = [
        'how many students do we have', 'current student count', 'today\'s schedule',
        'show me unpaid', 'list unpaid', 'current revenue', 'this month\'s revenue',
        'show me students in', 'list students in', 'who is in class',
        'current balance', 'families owing', 'payment status',
        'schedule for today', 'classes today', 'what classes are today',
        'current enrollment', 'how many families', 'active instructors',
        'unpaid invoices', 'outstanding charges', 'recent payments'
    ];

    // Check for specific database requests
    for (const indicator of databaseIndicators) {
        if (queryLower.includes(indicator)) {
            return { type: 'database', confidence: 10 };
        }
    }
    
    // Check for general data questions that might need database
    if (queryLower.includes('how many') && (queryLower.includes('student') || queryLower.includes('class') || queryLower.includes('famil'))) {
        return { type: 'database', confidence: 8 };
    }
    
    if (queryLower.includes('list') && (queryLower.includes('student') || queryLower.includes('class') || queryLower.includes('unpaid'))) {
        return { type: 'database', confidence: 8 };
    }
    
    if (queryLower.includes('show me') && (queryLower.includes('schedule') || queryLower.includes('unpaid') || queryLower.includes('revenue'))) {
        return { type: 'database', confidence: 8 };
    }

    // Everything else is conversational - this is the default
    return { type: 'casual', confidence: 10 };
}

// Smart contextual data fetching using the new efficient system
async function getSmartContextualData(classification, studioId, userQuery) {
    if (classification.type === 'casual') {
        console.log('Casual conversation - no database access needed');
        return null;
    }
    
    console.log('Database query detected - getting relevant database context');
    
    try {
        // Use the new efficient collection loader
        const databaseContext = getRelevantDatabaseContext(userQuery);
        
        if (!databaseContext) {
            console.log('No relevant database context identified');
            return null;
        }
        
        console.log('Relevant database context prepared:', Object.keys(databaseContext.relevantCollections));
        return databaseContext;
        
    } catch (error) {
        console.error('Error getting database context:', error);
        return null;
    }
}

function getCurrentDay() {
    const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    return days[new Date().getDay()];
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

// Enhanced AI query processing with conversational priority and efficient database context
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

        // Only fetch database data for specific data requests
        if (classification.type === 'database') {
            console.log('Specific data request detected - accessing studio database');
            
            const databaseContext = await getSmartContextualData(classification, studioId, userMessage);
            
            if (databaseContext) {
                messages.push({
                    role: "assistant", 
                    content: `I'll check your studio's database for the information you requested.`
                });
                messages.push({
                    role: "user", 
                    content: `Here's the relevant database structure for your query: ${JSON.stringify(databaseContext, null, 1)}\n\nPlease create appropriate database queries and provide a helpful response to: "${userMessage}"`
                });
            } else {
                // If no database context available, provide general guidance
                messages.push({
                    role: "assistant", 
                    content: `I understand you're looking for specific studio data. Let me provide guidance on this topic.`
                });
                messages.push({
                    role: "user", 
                    content: `The user asked: "${userMessage}" but I couldn't identify specific database collections needed. Please provide helpful guidance or suggest how to find this information.`
                });
            }
        }
        // For casual queries, just process with knowledge base - no mention of database

        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: "gpt-4-turbo-preview",
                messages: messages,
                max_tokens: 800,
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
        
        if (error.response?.status === 429) {
            return "I'm experiencing high demand right now. Please try again in a moment.";
        } else if (error.response?.status === 401) {
            return "I'm having trouble connecting to my AI service. Please contact support.";
        } else {
            return "I apologize, but I encountered an error processing your request. I'm here to help with studio management questions - please try asking again or rephrase your question.";
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