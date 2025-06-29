const { onRequest } = require("firebase-functions/v2/https");
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const axios = require("axios");

// Initialize Firebase Admin
admin.initializeApp();

// Import other function files - use full paths
const { processPayments } = require("./processPayments");
const { postMonthlyCharges, processMonthlyCharges } = require("./PostCharges");
const { processAutoPay } = require("./AutoPay");
const { chargesCalculator } = require("./chargesCalculator");
const { processSyncSenseQuery } = require("./syncSense");
const { processDatabaseQuery } = require('./processDatabaseQuery');

// PayArc Configuration
const PAYARC_CONFIG = {
  BASE_URL: "https://testapi.payarc.net/v1",
  VERSION: "1.0",
  MERCHANT_CODE: "0567059896206807",
  AGENT_KEY: "500000",
  // eslint-disable-next-line max-len
  API_KEY: "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiI0NzMzIiwianRpIjoiYTI2MzliYWZhOTRhMGI4ZTk2YjZiZWMzZWUxZWQ2YmE5ZGU0OGY3ODBkZDBmNzdiNDc3ZTg2YTJkNDkxYzg3MjlkMTUyZGYyOTA2MDZkZWYiLCJpYXQiOjE3MzMxNTk4OTcsIm5iZiI6MTczMzE1OTg5NywiZXhwIjoxODkwODM5ODk3LCJzdWIiOiI4NTI2NTcxIiwic2NvcGVzIjoiKiJ9.nqJte3MFtHg9Apvmzi17EIy_stqJtY47vycYdOV4MetrfkhbJZzFlWu3a4NKCo1dc_gBo0KoSKxi547xYpCnxTaC1vv7NgeUsqCfd3b8jesifaBI9xaxVkwAcSLQa0Sa62MB0Kwum6cUcNr1QiLZ_BpQtYJMOrN4BqcsHWxFyIkVSGSpxtwfXxKDIxR6haSsnS-mlzjtRcCG5COntajISv1pA9E7-DT1dRiMCWPR6HZR7cqvuuxU9YQpBgTCSSyvgzDkqMDmgGBwtxmxHefIlkn9TXSJn-Jzk9BkSETK2RF8Yb3X-zt-RDRsoxV7rlM2zKIJIxHx4AlSns1Kf3Q6A9AXqPQFG7lEy-IkBGQDBNMblTJsMncMv6vlVh9n5AA_oBlgjh6y4_jrPvy4_TW4kQNXC9xizMnRDYTFYpMENOuSbJoCzENA0ztxu6omopSfEYj4RuFAh8vh3Y9L2lXIuLjD05641FBft1erAprNqSOW72VH9o6w5K_m33GQkIEFhm2NUfqNPPl2lZ0KX60GRqP7_TEtUYEQOoKxreqG8_9cG6jqFjIxO6DEmfbKZEgYlyNJ2O3ToRs1G9cHmXZ6yUVsPJzWKhQUwOL8LyELcfk9LEkstCoaVeTYX2G6qSBx9619a3T0vVkCeNBSQzOLGQTuxD_Cp_yHX1npjz_RRK8"
};

// Get PayArc headers
const getPayarcHeaders = () => ({
  "Accept": "application/json",
  "Content-Type": "application/json",
  "Authorization": `Bearer ${PAYARC_CONFIG.API_KEY}`,
  "Payarc-Version": PAYARC_CONFIG.VERSION,
  "Merchant-Code": PAYARC_CONFIG.MERCHANT_CODE,
  "Agent-Code": PAYARC_CONFIG.AGENT_KEY
});

// Create Express app
const app = express();

// Enable CORS
app.use(cors({
  origin: [
    "https://studiosync-af73d.web.app",
    "https://studiosync-af73d.firebaseapp.com", 
    "https://studiosyncdance.com",
    "http://localhost:5000"
  ],
  methods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

app.use(express.json());

// Create Customer
app.post("/createCustomer", async (req, res) => {
  try {
    console.log("📦 Received customer creation request:", {
      ...req.body,
      email: req.body.email ? "****" + req.body.email.slice(-10) : null
    });

    const response = await axios.post(
      `${PAYARC_CONFIG.BASE_URL}/customers`,
      {
        ...req.body,
        test_mode: true
      },
      {
        headers: getPayarcHeaders()
      }
    );

    console.log("✅ PayArc customer response:", response.data);

    // Extract customer_id from the correct location
    const customerId = response.data && 
                      response.data.data && 
                      response.data.data.customer_id;
    
    if (!customerId) {
      console.error("❌ Missing customer_id in PayArc response:", response.data);
      return res.status(500).json({
        error: "Customer created but ID not found in response",
        details: response.data
      });
    }

    res.json({
      success: true,
      customer_id: customerId,
      data: response.data
    });

  } catch (error) {
    console.error("❌ Customer creation error:", {
      message: error.message,
      response: error.response && error.response.data,
      status: error.response && error.response.status
    });

    const statusCode = error.response && error.response.status || 500;
    const errorMessage = error.response && error.response.data && error.response.data.message || error.message;
    
    res.status(statusCode).json({
      error: errorMessage,
      details: error.response && error.response.data
    });
  }
});

// Create Token
app.post("/createToken", async (req, res) => {
  try {
    console.log("Received token creation request:", {
      ...req.body,
      card_number: req.body.card_number ? "****" + req.body.card_number.slice(-4) : null,
      cvv: "***"
    });

    const response = await axios.post(
      `${PAYARC_CONFIG.BASE_URL}/tokens`,
      {
        ...req.body,
        test_mode: true,
        authorize_card: 1
      },
      {
        headers: getPayarcHeaders()
      }
    );

    console.log("✅ Token created successfully:", {
      token_id: response.data && response.data.data && response.data.data.id,
      response: response.data
    });

    res.json({ data: response.data });
  } catch (error) {
    console.error("❌ Token creation error:", {
      message: error.message,
      response: error.response && error.response.data,
      status: error.response && error.response.status,
      requestBody: {
        ...req.body,
        card_number: "****",
        cvv: "***"
      }
    });

    const statusCode = error.response && error.response.status || 500;
    const errorMessage = error.response && error.response.data && error.response.data.message || error.message;
    
    res.status(statusCode).json({
      error: errorMessage,
      details: error.response && error.response.data
    });
  }
});

// Update Customer with Payment Method
app.post("/attachPaymentSource", async (req, res) => {
  try {
    console.log("📦 Updating customer with payment method:", {
      customer_id: req.body.customer_id,
      token_id: req.body.token_id
    });

    // Update customer with token_id using PATCH
    const updateResponse = await axios.patch(
      `${PAYARC_CONFIG.BASE_URL}/customers/${req.body.customer_id}`,
      { 
        token_id: req.body.token_id,
        test_mode: true
      },
      { 
        headers: {
          ...getPayarcHeaders(),
          "Accept": "application/json",
          "Content-Type": "application/json"
        }
      }
    );

    console.log("✅ Customer updated with payment method:", updateResponse.data);

    // Don't try to set as default - it's already handled
    res.json({
      success: true,
      data: updateResponse.data
    });

  } catch (error) {
    // If it's a 409 conflict (already default), treat it as success
    if (error.response && error.response.status === 409) {
      console.log("✅ Payment method already set as default");
      return res.json({
        success: true,
        data: error.response.data
      });
    }

    console.error("❌ Error updating customer payment method:", {
      message: error.message,
      response: error.response && error.response.data,
      status: error.response && error.response.status,
      url: `${PAYARC_CONFIG.BASE_URL}/customers/${req.body.customer_id}`
    });
    
    const errorStatus = error.response && error.response.status || 500;
    res.status(errorStatus).json({
      error: error.message,
      details: error.response && error.response.data
    });
  }
});

// Create Subscription
app.post("/createSubscription", async (req, res) => {
  try {
    console.log("📦 Creating subscription:", {
      customer_id: req.body.customer_id,
      plan_id: req.body.plan_id,
      billing_cycle: req.body.billing_cycle
    });

    const subscriptionData = {
      customer_id: req.body.customer_id,
      plan_id: req.body.plan_id,
      billing_cycle: req.body.billing_cycle,
      test_mode: true,
      start_after_days: 30,  // Start after 30-day trial
      trial_days: 30,        // 30-day trial period
      description: `${req.body.plan_name || "Studio Sync"} Subscription`
    };

    const response = await axios.post(
      `${PAYARC_CONFIG.BASE_URL}/subscriptions`,
      subscriptionData,
      { 
        headers: {
          ...getPayarcHeaders(),
          "Accept": "application/json",
          "Content-Type": "application/json"
        }
      }
    );

    console.log("✅ Subscription created:", {
      subscription_id: response.data && response.data.data && response.data.data.subscription_id,
      status: response.status,
      data: response.data
    });

    res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    console.error("❌ Error creating subscription:", {
      message: error.message,
      response: error.response && error.response.data,
      status: error.response && error.response.status
    });
    
    const errorStatus = error.response && error.response.status || 500;
    res.status(errorStatus).json({
      error: error.message,
      details: error.response && error.response.data
    });
  }
});

// Export the Express app as a Firebase Function v2
exports.api = onRequest({
  region: "us-central1",
  memory: "256MiB",
  minInstances: 0,
  maxInstances: 10
}, app);

// Export all functions
exports.processPayments = processPayments;
exports.postMonthlyCharges = postMonthlyCharges;
exports.processAutoPay = processAutoPay;
exports.processMonthlyCharges = processMonthlyCharges;
exports.chargesCalculator = chargesCalculator;
exports.postChargesHttp = require('./PostCharges').postChargesHttp;
exports.processAutoPayHttp = require('./AutoPay').processAutoPayHttp;
exports.processSyncSenseQuery = processSyncSenseQuery;
exports.processDatabaseQuery = processDatabaseQuery;