const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const axios = require("axios");
const express = require("express");
const cors = require("cors");

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

// Create an Express app
const app = express();

// CORS configuration
app.use(cors({ origin: true, methods: ["GET", "POST", "OPTIONS"] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Test endpoint
app.get("/test", (req, res) => {
  res.status(200).json({ message: "Payment API is working!", timestamp: new Date().toISOString() });
});

// ===== PAYMENT PROCESSING FUNCTIONS =====

// Add these improved logging functions at the top of your file
function logObject(label, obj, sensitive = false) {
  if (sensitive) {
    // Create a safe copy with masked sensitive data
    const safeCopy = { ...obj };
    
    // Mask card details if present
    if (safeCopy.card) {
      safeCopy.card = {
        ...safeCopy.card,
        card_number: safeCopy.card.card_number ? 
          "****" + safeCopy.card.card_number.slice(-4) : "[MISSING]",
        cvv: safeCopy.card.cvv ? "***" : "[MISSING]"
      };
    }
    
    console.log(`🔍 ${label}:`, JSON.stringify(safeCopy, null, 2));
  } else {
    console.log(`🔍 ${label}:`, JSON.stringify(obj, null, 2));
  }
}

function logError(label, error) {
  console.error(`❌ ${label}:`, error.message);
  console.error(`❌ ${label} stack:`, error.stack);
  
  // Log additional details if available
  if (error.response) {
    console.error(`❌ ${label} response data:`, error.response.data);
    console.error(`❌ ${label} response status:`, error.response.status);
  }
}

/**
 * Creates a PayArc token for a credit card
 */
async function createCardToken(cardDetails, apiKey, merchantCode, testMode = true) {
  try {
    console.log("🔍 Creating card token...");
    
    // Validate card details
    if (!cardDetails) {
      throw new Error("Card details are required");
    }
    
    const requiredFields = ['card_number', 'exp_month', 'exp_year', 'cvv'];
    const missingFields = requiredFields.filter(field => !cardDetails[field]);
    
    if (missingFields.length > 0) {
      throw new Error(`Missing required card fields: ${missingFields.join(', ')}`);
    }
    
    // Log masked card details
    console.log("🔍 Card details:", {
      card_number: "****" + cardDetails.card_number.slice(-4),
      exp_month: cardDetails.exp_month,
      exp_year: cardDetails.exp_year,
      cvv: "***",
      name: cardDetails.name,
      address_line1: cardDetails.address_line1,
      city: cardDetails.city,
      state_code: cardDetails.state_code,
      zip: cardDetails.zip,
      country_code: cardDetails.country_code
    });
    
    const tokenResponse = await axios.post(
      "https://testapi.payarc.net/v1/tokens",
      {
        ...cardDetails,
        card_source: "INTERNET",
        test_mode: testMode,
        authorize_card: 1
      },
      {
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "Payarc-Version": "1.0",
          "Merchant-Code": merchantCode,
          "Agent-Code": "500000"
        }
      }
    );
    
    const tokenId = tokenResponse.data?.data?.id;
    if (!tokenId) {
      throw new Error("Failed to create token");
    }
    
    console.log("✅ Token created:", tokenId);
    return { success: true, tokenId, data: tokenResponse.data };
    
  } catch (error) {
    console.error("❌ Token creation error:", error.response?.data || error.message);
    return { 
      success: false, 
      error: error.message,
      details: error.response?.data
    };
  }
}

/**
 * Creates a PayArc customer
 */
async function createCustomer(customerDetails, apiKey, merchantCode, testMode = true) {
  try {
    console.log("🔍 Creating customer...");
    
    const customerResponse = await axios.post(
      "https://testapi.payarc.net/v1/customers",
      {
        ...customerDetails,
        test_mode: testMode
      },
      {
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "Payarc-Version": "1.0",
          "Merchant-Code": merchantCode,
          "Agent-Code": "500000"
        }
      }
    );
    
    const customerId = customerResponse.data?.data?.customer_id;
    if (!customerId) {
      throw new Error("Failed to create customer");
    }
    
    console.log("✅ Customer created:", customerId);
    return { success: true, customerId, data: customerResponse.data };
    
  } catch (error) {
    console.error("❌ Customer creation error:", error.response?.data || error.message);
    return { 
      success: false, 
      error: error.message,
      details: error.response?.data
    };
  }
}

/**
 * Attaches a payment method to a customer
 */
async function attachPaymentMethod(customerId, tokenId, apiKey, merchantCode, testMode = true) {
  try {
    console.log("🔍 Attaching payment method to customer...");
    
    const attachResponse = await axios.patch(
      `https://testapi.payarc.net/v1/customers/${customerId}`,
      { 
        token_id: tokenId,
        test_mode: testMode
      },
      { 
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "Payarc-Version": "1.0",
          "Merchant-Code": merchantCode,
          "Agent-Code": "500000"
        }
      }
    );
    
    console.log("✅ Payment method attached");
    return { success: true, data: attachResponse.data };
    
  } catch (error) {
    console.error("❌ Payment method attachment error:", error.response?.data || error.message);
    return { 
      success: false, 
      error: error.message,
      details: error.response?.data
    };
  }
}

/**
 * Process a charge using the Payarc API
 */
async function processCharge(customerId, amount, description, apiKey, merchantCode, testMode = false, tokenId = null, transactionId = null) {
  try {
    // If customerId is provided, we're charging an existing customer
    if (customerId) {
      console.log(`💳 Processing charge for customer ${customerId}, amount: $${(amount).toFixed(2)}`);
    } else if (tokenId) {
      console.log(`💳 Processing one-time charge with token ${tokenId}, amount: $${(amount).toFixed(2)}`);
    } else {
      console.log(`💳 Processing one-time charge, amount: $${(amount).toFixed(2)}`);
    }
    
    // Round the amount to 2 decimal places
    const roundedAmount = parseFloat(amount.toFixed(2));
    
    // Convert to cents for the API
    const amountInCents = Math.round(roundedAmount * 100);
    console.log(`🔍 Amount in cents: ${amountInCents}`);
    
    // Force test mode for now
    testMode = true;
    
    // Prepare the charge data
    const chargeData = {
      amount: amountInCents,
      currency: "usd",
      description: description || "Payment",
      capture: 1,
      test_mode: 1,
      do_not_send_email_to_customer: false,
      do_not_send_sms_to_customer: true
    };
    
    // Add customer_id if provided
    if (customerId) {
      chargeData.customer_id = customerId;
    }
    
    // Add token_id if provided (for one-time payments)
    if (tokenId) {
      chargeData.token_id = tokenId;
      console.log(`🔍 Using token ID for one-time payment: ${tokenId.substring(0, 4)}...${tokenId.substring(tokenId.length - 4)}`);
    }
    
    // Log the charge data (mask sensitive info)
    console.log("🔍 Processing charge with payload:", {
      ...chargeData,
      customer_id: customerId ? customerId.substring(0, 4) + "..." + customerId.substring(customerId.length - 4) : undefined,
      token_id: tokenId ? tokenId.substring(0, 4) + "..." + tokenId.substring(tokenId.length - 4) : undefined
    });
    
    // Always use test API endpoint for now
    const apiEndpoint = "https://testapi.payarc.net/v1/charges";
    
    console.log(`🔍 Using API URL: ${apiEndpoint} (FORCED TEST MODE)`);
    console.log(`🔍 Using Merchant Code: ${merchantCode}`);
    console.log(`🔍 API Key length: ${apiKey.length}`);
    console.log(`🔍 Test mode: Yes (FORCED)`);
    
    // First few and last few characters of API key for debugging
    const apiKeyPreview = apiKey.substring(0, 10) + "..." + apiKey.substring(apiKey.length - 10);
    console.log(`🔍 API Key preview: ${apiKeyPreview}`);
    
    // Make the API request to Payarc with all required headers
    console.log(`🔍 Sending API request to Payarc...`);
    const response = await axios.post(
      apiEndpoint,
      chargeData,
      {
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "Payarc-Version": "1.0",
          "Merchant-Code": merchantCode,
          "Agent-Code": "500000"
        }
      }
    );
    
    console.log(`🔍 Received API response with status: ${response.status}`);
    
    // Log the full response for debugging
    console.log("🔍 Full API response:", JSON.stringify(response.data, null, 2));
    
    // Check if the charge was successful
    if (response.status === 201 || response.status === 200) {
      // Extract charge details from the response
      let chargeId, chargeAmount, chargeStatus, isPartialPayment = false;
      let requestedAmount = amountInCents;
      let approvedAmount = 0;
      
      console.log(`🔍 Parsing API response to extract charge details...`);
      
      // Handle different response structures
      if (response.data.data && typeof response.data.data === 'object') {
        // New API format with data object
        console.log(`🔍 Using new API response format (data object)`);
        chargeId = response.data.data.id;
        console.log(`🔍 Extracted charge ID: ${chargeId}`);
        
        // Check if this is a partial payment (amount approved is less than requested)
        approvedAmount = parseInt(response.data.data.amount_approved || response.data.data.amount);
        console.log(`🔍 Requested amount: ${requestedAmount} cents, Approved amount: ${approvedAmount} cents`);
        
        if (approvedAmount < requestedAmount) {
          isPartialPayment = true;
          console.log(`⚠️ PARTIAL PAYMENT DETECTED: Requested $${(requestedAmount/100).toFixed(2)}, Approved $${(approvedAmount/100).toFixed(2)}`);
          console.log(`⚠️ Difference: $${((requestedAmount - approvedAmount)/100).toFixed(2)}`);
        } else {
          console.log(`✅ Full payment approved: $${(approvedAmount/100).toFixed(2)}`);
        }
        
        chargeAmount = approvedAmount ? approvedAmount / 100 : amount;
        chargeStatus = isPartialPayment ? "Partial" : (response.data.data.status || "Paid");
        console.log(`🔍 Charge amount: $${chargeAmount.toFixed(2)}, Status: ${chargeStatus}`);
      } else if (response.data.id) {
        // Old API format with direct properties
        console.log(`🔍 Using old API response format (direct properties)`);
        chargeId = response.data.id;
        console.log(`🔍 Extracted charge ID: ${chargeId}`);
        
        // Check if this is a partial payment
        approvedAmount = parseInt(response.data.amount_approved || response.data.amount);
        console.log(`🔍 Requested amount: ${requestedAmount} cents, Approved amount: ${approvedAmount} cents`);
        
        if (approvedAmount < requestedAmount) {
          isPartialPayment = true;
          console.log(`⚠️ PARTIAL PAYMENT DETECTED: Requested $${(requestedAmount/100).toFixed(2)}, Approved $${(approvedAmount/100).toFixed(2)}`);
          console.log(`⚠️ Difference: $${((requestedAmount - approvedAmount)/100).toFixed(2)}`);
        } else {
          console.log(`✅ Full payment approved: $${(approvedAmount/100).toFixed(2)}`);
        }
        
        chargeAmount = approvedAmount ? approvedAmount / 100 : amount;
        chargeStatus = isPartialPayment ? "Partial" : (response.data.status || "Paid");
        console.log(`🔍 Charge amount: $${chargeAmount.toFixed(2)}, Status: ${chargeStatus}`);
      } else {
        // Fallback for test API which might have a different structure
        console.log(`⚠️ Could not extract charge details from response, using fallback values`);
        chargeId = `test_charge_${Date.now()}`;
        chargeAmount = amount;
        chargeStatus = "Paid";
        isPartialPayment = false;
        console.log(`⚠️ Using fallback charge ID for test mode: ${chargeId}`);
        console.log(`⚠️ Using fallback charge amount: $${chargeAmount.toFixed(2)}`);
        console.log(`⚠️ Using fallback charge status: ${chargeStatus}`);
      }
      
      console.log("✅ Charge processed successfully:", {
        id: chargeId,
        amount: chargeAmount,
        status: chargeStatus,
        isPartialPayment: isPartialPayment,
        requestedAmount: amount
      });
      
      return {
        success: true,
        chargeId: chargeId,
        amount: chargeAmount,
        status: chargeStatus,
        isPartialPayment: isPartialPayment,
        requestedAmount: amount,
        data: response.data
      };
    } else {
      console.error(`❌ Unexpected response status: ${response.status}`);
      return {
        success: false,
        error: `Unexpected response status: ${response.status}`
      };
    }
    
  } catch (error) {
    console.error("❌ Charge processing error:", error.response?.data || error.message);
    
    if (error.response) {
      console.error("❌ Charge API response status:", error.response.status);
      console.error("❌ Charge API response data:", error.response.data);
      console.error("❌ Charge API response headers:", error.response.headers);
    }
    
    // Don't return success: true if the charge failed
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
}

/**
 * Gets the payment credentials for a studio
 */
async function getStudioPaymentCredentials(studioId) {
  // Add validation
  if (!studioId) {
    console.error("❌ Studio ID is required for payment processing");
    throw new Error("Studio ID is required for payment processing");
  }
  
  console.log(`🔍 Getting payment credentials for studio ID: "${studioId}"`);
  
  const db = admin.firestore();
  try {
    // First, get the studio document
    const studioDoc = await db.collection("Studios").doc(studioId).get();
    
    if (!studioDoc.exists) {
      console.error(`❌ Studio with ID ${studioId} not found`);
      throw new Error(`Studio with ID ${studioId} not found`);
    }
    
    const studioData = studioDoc.data();
    console.log(`✅ Found studio: ${studioData.StudioName || 'Unknown Studio'}`);
    
    // Now, get the Settings document from the PaymentProcessing subcollection
    console.log(`🔍 Fetching PaymentProcessing/Settings document for studio ${studioId}`);
    const settingsDoc = await db.collection("Studios").doc(studioId)
      .collection("PaymentProcessing").doc("Settings").get();
    
    if (!settingsDoc.exists) {
      console.error(`❌ PaymentProcessing Settings document not found for studio ${studioId}`);
      throw new Error("Studio does not have payment processing set up");
    }
    
    const settingsData = settingsDoc.data();
    
    // Check if Payarc settings exist
    if (!settingsData.Payarc) {
      console.error(`❌ Studio ${studioId} does not have Payarc settings`);
      throw new Error("Studio does not have Payarc payment processing set up");
    }
    
    // Get API key and merchant ID from the correct path
    const payarcSettings = settingsData.Payarc;
    
    // Log the full Payarc settings map
    console.log("🔍 Payarc settings map:", {
      Enabled: payarcSettings.Enabled === true ? "true" : "false",
      ApiKey: payarcSettings.ApiKey ? `${payarcSettings.ApiKey.substring(0, 10)}...` : "NOT FOUND",
      MerchantId: payarcSettings.MerchantId || "NOT FOUND"
    });
    
    // Log individual values
    console.log("🔍 Payarc Enabled:", payarcSettings.Enabled === true ? "true" : "false");
    if (payarcSettings.ApiKey) {
      console.log("🔍 Payarc ApiKey:", `${payarcSettings.ApiKey.substring(0, 10)}...`);
    } else {
      console.log("❌ Payarc ApiKey: NOT FOUND");
    }
    console.log("🔍 Payarc MerchantId:", payarcSettings.MerchantId || "NOT FOUND");
    
    const apiKey = payarcSettings.ApiKey;
    const merchantCode = payarcSettings.MerchantId;
    
    if (!apiKey || !merchantCode) {
      console.error(`❌ Studio ${studioId} is missing API key or merchant ID`);
      throw new Error("Studio is missing API key or merchant ID");
    }
    
    return {
      success: true,
      apiKey,
      merchantCode
    };
    
  } catch (error) {
    console.error(`❌ Error fetching studio data: ${error.message}`);
    console.error(error.stack);
    throw error;
  }
}

// ===== PAYMENT SCENARIOS =====

/**
 * Process a registration payment
 */
async function processRegistrationPayment(data) {
  try {
    console.log("🏫 Processing registration payment");
    
    // Log the raw includedSurcharge value to debug
    console.log("🔍 Raw includedSurcharge value:", data.includedSurcharge);
    
    console.log("🏫 Payment data:", {
      studioId: data.studioId,
      amount: data.payment?.amount,
      description: data.payment?.description,
      includedSurcharge: data.includedSurcharge === true ? "Yes" : "No"
    });
    
    // Get studio credentials
    console.log(`🏫 Getting payment credentials for studio: ${data.studioId}`);
    const credentials = await getStudioPaymentCredentials(data.studioId);
    if (!credentials.success) {
      console.error(`❌ Failed to get studio payment credentials: ${credentials.error}`);
      throw new Error(credentials.error);
    }
    
    // Check if the client already included a surcharge
    let surchargeRate = 0;
    let surchargeAmount = 0;
    let totalAmount = data.payment.amount;
    let surchargeType = "percentage"; // Default to percentage
    
    // Fix the check for includedSurcharge - use strict equality with true
    const clientIncludedSurcharge = data.includedSurcharge === true;
    
    if (clientIncludedSurcharge) {
      console.log(`🏫 Client indicates surcharge is already included in amount`);
      
      // Skip surcharge calculation
      console.log(`🏫 Skipping surcharge calculation as it's already included in the amount`);
      
      // For accounting purposes, estimate what the surcharge was
      // This is just for record-keeping, not for adding to the total
      if (data.surchargeAmount) {
        // If client provided the surcharge amount, use it but round to 2 decimal places
        surchargeAmount = parseFloat(data.surchargeAmount.toFixed(2));
        console.log(`🔍 Using client-provided surcharge amount: $${surchargeAmount.toFixed(2)}`);
      } else {
        // Otherwise estimate it based on studio settings
        try {
          const surchargeDoc = await admin.firestore()
            .collection('Studios')
            .doc(data.studioId)
            .collection('Surcharge')
            .doc('SurchargeSettings')
            .get();
          
          if (surchargeDoc.exists) {
            const surchargeData = surchargeDoc.data();
            if (surchargeData.IsActive) {
              surchargeType = surchargeData.Type || "percentage";
              if (surchargeType === "percentage") {
                surchargeRate = surchargeData.Value || 0;
                // Estimate what the surcharge would have been
                const estimatedSubtotal = data.payment.amount / (1 + (surchargeRate / 100));
                surchargeAmount = data.payment.amount - estimatedSubtotal;
                console.log(`🔍 Estimated surcharge amount: $${surchargeAmount.toFixed(2)} (not adding to total)`);
              }
            }
          }
        } catch (error) {
          console.error("❌ Error estimating surcharge amount:", error);
        }
      }
    } else {
      // Only calculate and add surcharge if not already included
      console.log(`🏫 Checking for surcharge settings...`);
      try {
        // First try to get surcharge from the Surcharge collection
        console.log(`🏫 Looking for surcharge in Studios/${data.studioId}/Surcharge/SurchargeSettings`);
        const surchargeDoc = await admin.firestore()
          .collection('Studios')
          .doc(data.studioId)
          .collection('Surcharge')
          .doc('SurchargeSettings')
          .get();
        
        if (surchargeDoc.exists) {
          const surchargeData = surchargeDoc.data();
          console.log(`🔍 Found surcharge settings:`, surchargeData);
          
          // Check if surcharge is enabled
          if (surchargeData.IsActive) {
            surchargeType = surchargeData.Type || "percentage";
            console.log(`🔍 Surcharge is active, type: ${surchargeType}`);
            
            if (surchargeType === "percentage") {
              surchargeRate = surchargeData.Value || 0;
              console.log(`🔍 Studio has percentage surcharge enabled at rate: ${surchargeRate}%`);
              
              // Calculate surcharge amount based on percentage
              surchargeAmount = parseFloat((data.payment.amount * (surchargeRate / 100)).toFixed(2));
              console.log(`🔍 Calculated surcharge amount: $${surchargeAmount.toFixed(2)}`);
            } else if (surchargeType === "fixed") {
              surchargeAmount = surchargeData.Value || 0;
              console.log(`🔍 Studio has fixed surcharge enabled at amount: $${surchargeAmount.toFixed(2)}`);
            }
            
            totalAmount = data.payment.amount + surchargeAmount;
            
            console.log(`🔍 Original amount: $${data.payment.amount.toFixed(2)}, Surcharge: $${surchargeAmount.toFixed(2)}, Total: $${totalAmount.toFixed(2)}`);
          } else {
            console.log("🔍 Studio has surcharge settings but it's not active");
          }
        } else {
          // Fallback to the old location (directly in the studio document)
          console.log(`🏫 No surcharge settings found in subcollection, checking studio document`);
          const studioDoc = await admin.firestore().collection('Studios').doc(data.studioId).get();
          const studioData = studioDoc.data();
          
          // Check if surcharge is enabled for this studio
          if (studioData && studioData.Surcharge && studioData.Surcharge.Enabled) {
            surchargeType = studioData.Surcharge.Type || "percentage";
            console.log(`🔍 Found surcharge in studio document, type: ${surchargeType}`);
            
            if (surchargeType === "percentage") {
              surchargeRate = studioData.Surcharge.Rate || 0;
              console.log(`🔍 Studio has percentage surcharge enabled at rate: ${surchargeRate}%`);
              
              // Calculate surcharge amount based on percentage
              surchargeAmount = parseFloat((data.payment.amount * (surchargeRate / 100)).toFixed(2));
              console.log(`🔍 Calculated surcharge amount: $${surchargeAmount.toFixed(2)}`);
            } else if (surchargeType === "fixed") {
              surchargeAmount = studioData.Surcharge.Amount || 0;
              console.log(`🔍 Studio has fixed surcharge enabled at amount: $${surchargeAmount.toFixed(2)}`);
            }
            
            totalAmount = data.payment.amount + surchargeAmount;
            
            console.log(`🔍 Original amount: $${data.payment.amount.toFixed(2)}, Surcharge: $${surchargeAmount.toFixed(2)}, Total: $${totalAmount.toFixed(2)}`);
          } else {
            console.log("🔍 Studio does not have surcharge enabled");
          }
        }
      } catch (error) {
        console.error("❌ Error fetching studio surcharge settings:", error);
        // Continue without surcharge if there's an error
      }
    }
    
    // Create a token for the card
    console.log(`🏫 Creating token for card...`);
    const tokenResult = await createCardToken(
      data.card, 
      credentials.apiKey, 
      credentials.merchantCode, 
      data.test_mode
    );
    
    if (!tokenResult.success) {
      console.error(`❌ Failed to create token: ${tokenResult.error}`);
      throw new Error(`Failed to create token: ${tokenResult.error}`);
    }
    
    // Create a customer
    console.log(`🏫 Creating customer...`);
    const customerResult = await createCustomer(
      data.customer, 
      credentials.apiKey, 
      credentials.merchantCode, 
      data.test_mode
    );
    
    if (!customerResult.success) {
      console.error(`❌ Failed to create customer: ${customerResult.error}`);
      throw new Error(`Failed to create customer: ${customerResult.error}`);
    }
    
    // Attach payment method to customer
    console.log(`🏫 Attaching payment method to customer...`);
    const attachResult = await attachPaymentMethod(
      customerResult.customerId,
      tokenResult.tokenId,
      credentials.apiKey,
      credentials.merchantCode
    );
    
    if (!attachResult.success) {
      console.error(`❌ Failed to attach payment method: ${attachResult.error}`);
      throw new Error(`Failed to attach payment method: ${attachResult.error}`);
    }
    
    // Process charge with customer ID and total amount (including surcharge)
    console.log(`🏫 Processing charge for total amount: $${totalAmount.toFixed(2)} (includes $${surchargeAmount.toFixed(2)} surcharge)`);
    const chargeResult = await processCharge(
      customerResult.customerId,
      totalAmount,
      data.payment.description || "Registration payment",
      credentials.apiKey,
      credentials.merchantCode,
      data.test_mode,
      data.transactionId
    );
    
    if (!chargeResult.success) {
      console.error(`❌ Charge processing failed: ${chargeResult.error}`);
      throw new Error(`Charge processing failed: ${chargeResult.error}`);
    }
    
    // Check if this was a partial payment
    const isPartialPayment = chargeResult.isPartialPayment || false;
    const actualAmount = chargeResult.amount || 0;
    const requestedAmount = chargeResult.requestedAmount || totalAmount;
    
    console.log(`🏫 Charge result: success=${chargeResult.success}, amount=$${actualAmount.toFixed(2)}, isPartialPayment=${isPartialPayment}`);
    
    // Calculate the actual surcharge based on the proportion of the payment that went through
    let actualSurchargeAmount = surchargeAmount;
    if (isPartialPayment && surchargeAmount > 0) {
      console.log(`🏫 Recalculating surcharge for partial payment...`);
      // Recalculate surcharge proportionally for partial payments
      if (surchargeType === "percentage") {
        // For percentage, recalculate based on the actual amount
        const actualSubtotal = actualAmount / (1 + (surchargeRate / 100));
        actualSurchargeAmount = actualAmount - actualSubtotal;
        console.log(`🏫 Recalculated percentage surcharge: actualSubtotal=$${actualSubtotal.toFixed(2)}, actualSurcharge=$${actualSurchargeAmount.toFixed(2)}`);
      } else {
        // For fixed, prorate the surcharge based on payment proportion
        const paymentProportion = actualAmount / requestedAmount;
        actualSurchargeAmount = surchargeAmount * paymentProportion;
        console.log(`🏫 Prorated fixed surcharge: proportion=${paymentProportion.toFixed(4)}, actualSurcharge=$${actualSurchargeAmount.toFixed(2)}`);
      }
      
      console.log(`🔍 Partial payment: Adjusted surcharge from $${surchargeAmount.toFixed(2)} to $${actualSurchargeAmount.toFixed(2)}`);
    }
    
    // Return success with customer ID, token ID, charge ID, and surcharge details
    const result = {
      success: true,
      customerId: customerResult.customerId,
      tokenId: tokenResult.tokenId,
      chargeId: chargeResult.chargeId,
      amount: actualAmount,
      subtotal: isPartialPayment ? (actualAmount - actualSurchargeAmount) : data.payment.amount,
      surchargeAmount: actualSurchargeAmount,
      surchargeRate: surchargeRate,
      surchargeType: surchargeType,
      status: chargeResult.status || (isPartialPayment ? "Partial" : "Paid"),
      isPartialPayment: isPartialPayment,
      requestedAmount: requestedAmount,
      data: {
        customer: customerResult.data,
        token: tokenResult.data,
        charge: chargeResult.data
      }
    };
    
    console.log(`🏫 Final payment result:`, {
      success: result.success,
      customerId: result.customerId,
      tokenId: result.tokenId,
      chargeId: result.chargeId,
      amount: result.amount,
      subtotal: result.subtotal,
      surchargeAmount: result.surchargeAmount,
      status: result.status,
      isPartialPayment: result.isPartialPayment
    });
    
    return result;
    
  } catch (error) {
    console.error("❌ Registration payment error:", error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Process a one-time payment (no customer creation)
 */
async function processOneTimePayment(data) {
  try {
    console.log("💳 Processing one-time payment");
    console.log("💳 Payment data:", {
      studioId: data.studioId,
      amount: data.payment?.amount,
      description: data.payment?.description
    });
    
    // Get studio credentials
    console.log(`💳 Getting payment credentials for studio: ${data.studioId}`);
    const credentials = await getStudioPaymentCredentials(data.studioId);
    if (!credentials.success) {
      console.error(`❌ Failed to get studio payment credentials: ${credentials.error}`);
      throw new Error(credentials.error);
    }
    
    // Get studio surcharge settings
    let surchargeRate = 0;
    let surchargeAmount = 0;
    let totalAmount = data.payment.amount;
    let surchargeType = "percentage"; // Default to percentage
    
    console.log(`💳 Checking for surcharge settings...`);
    try {
      // Check for surcharge settings (same code as in processExistingCustomerPayment)
      // ... (surcharge calculation code)
    } catch (error) {
      console.error("❌ Error fetching studio surcharge settings:", error);
      // Continue without surcharge if there's an error
    }
    
    // Create a token for the card
    console.log(`💳 Creating token for card...`);
    const tokenResult = await createCardToken(
      data.card, 
      credentials.apiKey, 
      credentials.merchantCode, 
      data.test_mode
    );
    
    if (!tokenResult.success) {
      console.error(`❌ Failed to create token: ${tokenResult.error}`);
      throw new Error(`Failed to create token: ${tokenResult.error}`);
    }
    
    // Process charge with token and total amount (including surcharge)
    console.log(`💳 Processing charge for total amount: $${totalAmount.toFixed(2)} (includes $${surchargeAmount.toFixed(2)} surcharge)`);
    const chargeResult = await processCharge(
      null, // No customer ID for one-time payments
      totalAmount,
      data.payment.description || "One-time payment",
      credentials.apiKey,
      credentials.merchantCode,
      data.test_mode,
      tokenResult.tokenId, // Pass token ID for one-time payments
      data.transactionId
    );
    
    if (!chargeResult.success) {
      console.error(`❌ Charge processing failed: ${chargeResult.error}`);
      throw new Error(`Charge processing failed: ${chargeResult.error}`);
    }
    
    // Check if this was a partial payment
    const isPartialPayment = chargeResult.isPartialPayment || false;
    const actualAmount = chargeResult.amount || 0;
    const requestedAmount = chargeResult.requestedAmount || totalAmount;
    
    console.log(`💳 Charge result: success=${chargeResult.success}, amount=$${actualAmount.toFixed(2)}, isPartialPayment=${isPartialPayment}`);
    
    // Calculate the actual surcharge based on the proportion of the payment that went through
    let actualSurchargeAmount = surchargeAmount;
    if (isPartialPayment && surchargeAmount > 0) {
      console.log(`💳 Recalculating surcharge for partial payment...`);
      // Recalculate surcharge proportionally for partial payments
      if (surchargeType === "percentage") {
        // For percentage, recalculate based on the actual amount
        const actualSubtotal = actualAmount / (1 + (surchargeRate / 100));
        actualSurchargeAmount = actualAmount - actualSubtotal;
        console.log(`💳 Recalculated percentage surcharge: actualSubtotal=$${actualSubtotal.toFixed(2)}, actualSurcharge=$${actualSurchargeAmount.toFixed(2)}`);
      } else {
        // For fixed, prorate the surcharge based on payment proportion
        const paymentProportion = actualAmount / requestedAmount;
        actualSurchargeAmount = surchargeAmount * paymentProportion;
        console.log(`💳 Prorated fixed surcharge: proportion=${paymentProportion.toFixed(4)}, actualSurcharge=$${actualSurchargeAmount.toFixed(2)}`);
      }
      
      console.log(`🔍 Partial payment: Adjusted surcharge from $${surchargeAmount.toFixed(2)} to $${actualSurchargeAmount.toFixed(2)}`);
    }
    
    // Return success with charge ID and surcharge details
    const result = {
      success: true,
      chargeId: chargeResult.chargeId,
      amount: actualAmount,
      subtotal: isPartialPayment ? (actualAmount - actualSurchargeAmount) : data.payment.amount,
      surchargeAmount: actualSurchargeAmount,
      surchargeRate: surchargeRate,
      surchargeType: surchargeType,
      status: chargeResult.status || (isPartialPayment ? "Partial" : "Paid"),
      isPartialPayment: isPartialPayment,
      requestedAmount: requestedAmount,
      data: {
        charge: chargeResult.data
      }
    };
    
    console.log(`💳 Final payment result:`, {
      success: result.success,
      chargeId: result.chargeId,
      amount: result.amount,
      subtotal: result.subtotal,
      surchargeAmount: result.surchargeAmount,
      status: result.status,
      isPartialPayment: result.isPartialPayment
    });
    
    return result;
    
  } catch (error) {
    console.error("❌ One-time payment error:", error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Processes a payment for an existing customer
 */
async function processExistingCustomerPayment(data) {
  try {
    console.log("👤 Processing payment for existing customer");
    console.log("👤 Payment data:", {
      studioId: data.studioId,
      customerId: data.customerId ? data.customerId.substring(0, 4) + "..." + data.customerId.substring(data.customerId.length - 4) : undefined,
      amount: data.payment?.amount
    });
    
    // Check if we have the required fields
    if (!data.customerId) {
      console.error("❌ Customer ID is required for existing customer payments");
      throw new Error("Customer ID is required for existing customer payments");
    }
    
    if (!data.payment || !data.payment.amount) {
      console.error("❌ Payment amount is required");
      throw new Error("Payment amount is required");
    }
    
    // Get studio credentials
    console.log(`👤 Getting payment credentials for studio: ${data.studioId}`);
    const credentials = await getStudioPaymentCredentials(data.studioId);
    if (!credentials.success) {
      console.error(`❌ Failed to get studio payment credentials: ${credentials.error}`);
      throw new Error(credentials.error);
    }
    
    console.log("👤 Using saved payment method for customer:", data.customerId);
    
    // Get studio surcharge settings
    let surchargeRate = 0;
    let surchargeAmount = 0;
    let totalAmount = data.payment.amount;
    let surchargeType = "percentage"; // Default to percentage
    
    console.log(`👤 Checking for surcharge settings...`);
    try {
      // First try to get surcharge from the Surcharge collection
      console.log(`👤 Looking for surcharge in Studios/${data.studioId}/Surcharge/SurchargeSettings`);
      const surchargeDoc = await admin.firestore()
        .collection('Studios')
        .doc(data.studioId)
        .collection('Surcharge')
        .doc('SurchargeSettings')
        .get();
      
      if (surchargeDoc.exists) {
        const surchargeData = surchargeDoc.data();
        console.log(`🔍 Found surcharge settings:`, surchargeData);
        
        // Check if surcharge is enabled
        if (surchargeData.IsActive) {
          surchargeType = surchargeData.Type || "percentage";
          console.log(`🔍 Surcharge is active, type: ${surchargeType}`);
          
          if (surchargeType === "percentage") {
            surchargeRate = surchargeData.Value || 0;
            console.log(`🔍 Studio has percentage surcharge enabled at rate: ${surchargeRate}%`);
            
            // Calculate surcharge amount based on percentage
            surchargeAmount = parseFloat((data.payment.amount * (surchargeRate / 100)).toFixed(2));
            console.log(`🔍 Calculated surcharge amount: $${surchargeAmount.toFixed(2)}`);
          } else if (surchargeType === "fixed") {
            surchargeAmount = surchargeData.Value || 0;
            console.log(`🔍 Studio has fixed surcharge enabled at amount: $${surchargeAmount.toFixed(2)}`);
          }
          
          totalAmount = data.payment.amount + surchargeAmount;
          
          console.log(`🔍 Original amount: $${data.payment.amount.toFixed(2)}, Surcharge: $${surchargeAmount.toFixed(2)}, Total: $${totalAmount.toFixed(2)}`);
        } else {
          console.log("🔍 Studio has surcharge settings but it's not active");
        }
      } else {
        // Fallback to the old location (directly in the studio document)
        console.log(`👤 No surcharge settings found in subcollection, checking studio document`);
        const studioDoc = await admin.firestore().collection('Studios').doc(data.studioId).get();
        const studioData = studioDoc.data();
        
        // Check if surcharge is enabled for this studio
        if (studioData && studioData.Surcharge && studioData.Surcharge.Enabled) {
          surchargeType = studioData.Surcharge.Type || "percentage";
          console.log(`🔍 Found surcharge in studio document, type: ${surchargeType}`);
          
          if (surchargeType === "percentage") {
            surchargeRate = studioData.Surcharge.Rate || 0;
            console.log(`🔍 Studio has percentage surcharge enabled at rate: ${surchargeRate}%`);
            
            // Calculate surcharge amount based on percentage
            surchargeAmount = parseFloat((data.payment.amount * (surchargeRate / 100)).toFixed(2));
            console.log(`🔍 Calculated surcharge amount: $${surchargeAmount.toFixed(2)}`);
          } else if (surchargeType === "fixed") {
            surchargeAmount = studioData.Surcharge.Amount || 0;
            console.log(`🔍 Studio has fixed surcharge enabled at amount: $${surchargeAmount.toFixed(2)}`);
          }
          
          totalAmount = data.payment.amount + surchargeAmount;
          
          console.log(`🔍 Original amount: $${data.payment.amount.toFixed(2)}, Surcharge: $${surchargeAmount.toFixed(2)}, Total: $${totalAmount.toFixed(2)}`);
        } else {
          console.log("🔍 Studio does not have surcharge enabled");
        }
      }
    } catch (error) {
      console.error("❌ Error fetching studio surcharge settings:", error);
      // Continue without surcharge if there's an error
    }
    
    // Process charge with customer ID and total amount (including surcharge)
    console.log(`👤 Processing charge for total amount: $${totalAmount.toFixed(2)} (includes $${surchargeAmount.toFixed(2)} surcharge)`);
    const chargeResult = await processCharge(
      data.customerId,
      totalAmount,
      data.payment.description || "Auto payment",
      credentials.apiKey,
      credentials.merchantCode,
      data.test_mode !== false,
      null, // tokenId
      data.transactionId // Add transactionId parameter
    );
    
    if (!chargeResult.success) {
      console.error(`❌ Charge processing failed: ${chargeResult.error}`);
      throw new Error(`Charge processing failed: ${chargeResult.error}`);
    }
    
    // Check if this was a partial payment
    const isPartialPayment = chargeResult.isPartialPayment || false;
    const actualAmount = chargeResult.amount || 0;
    const requestedAmount = chargeResult.requestedAmount || totalAmount;
    
    console.log(`👤 Charge result: success=${chargeResult.success}, amount=$${actualAmount.toFixed(2)}, isPartialPayment=${isPartialPayment}`);
    
    // Calculate the actual surcharge based on the proportion of the payment that went through
    let actualSurchargeAmount = surchargeAmount;
    if (isPartialPayment && surchargeAmount > 0) {
      console.log(`👤 Recalculating surcharge for partial payment...`);
      // Recalculate surcharge proportionally for partial payments
      if (surchargeType === "percentage") {
        // For percentage, recalculate based on the actual amount
        const actualSubtotal = actualAmount / (1 + (surchargeRate / 100));
        actualSurchargeAmount = actualAmount - actualSubtotal;
        console.log(`👤 Recalculated percentage surcharge: actualSubtotal=$${actualSubtotal.toFixed(2)}, actualSurcharge=$${actualSurchargeAmount.toFixed(2)}`);
      } else {
        // For fixed, prorate the surcharge based on payment proportion
        const paymentProportion = actualAmount / requestedAmount;
        actualSurchargeAmount = surchargeAmount * paymentProportion;
        console.log(`👤 Prorated fixed surcharge: proportion=${paymentProportion.toFixed(4)}, actualSurcharge=$${actualSurchargeAmount.toFixed(2)}`);
      }
      
      console.log(`🔍 Partial payment: Adjusted surcharge from $${surchargeAmount.toFixed(2)} to $${actualSurchargeAmount.toFixed(2)}`);
    }
    
    // Return success with charge ID and surcharge details
    const result = {
      success: true,
      chargeId: chargeResult.chargeId,
      amount: actualAmount,
      subtotal: isPartialPayment ? (actualAmount - actualSurchargeAmount) : data.payment.amount,
      surchargeAmount: actualSurchargeAmount,
      surchargeRate: surchargeRate,
      surchargeType: surchargeType,
      status: chargeResult.status || (isPartialPayment ? "Partial" : "Paid"),
      isPartialPayment: isPartialPayment,
      requestedAmount: requestedAmount,
      data: {
        charge: chargeResult.data
      }
    };
    
    console.log(`👤 Final payment result:`, {
      success: result.success,
      chargeId: result.chargeId,
      amount: result.amount,
      subtotal: result.subtotal,
      surchargeAmount: result.surchargeAmount,
      status: result.status,
      isPartialPayment: result.isPartialPayment
    });
    
    return result;
    
  } catch (error) {
    console.error("❌ Existing customer payment error:", error);
    return {
      success: false,
      error: error.message
    };
  }
}

// ===== MAIN ROUTE HANDLER =====

app.post("/process-payment", async (req, res) => {
  try {
    console.log("📦 Received payment request");
    
    // Extract payment data from request
    const paymentData = req.body.data || req.body;
    
    // Mask sensitive data for logging
    const maskedData = maskSensitiveData(paymentData);
    console.log("🔍 Extracted payment data:", maskedData);
    
    // Extract studio ID
    const studioId = paymentData.studioId;
    console.log(`🔍 Using studio ID: "${studioId}"`);
    
    if (!studioId) {
      return res.status(400).json({
        success: false,
        error: "Studio ID is required"
      });
    }
    
    // Check for registration from studentregister.html
    // If it's a registration payment with a surchargeAmount already included,
    // we can assume the surcharge is already included
    const isRegistration = paymentData.paymentType === "registration" || 
                          !paymentData.paymentType;
    const hasSurchargeAmount = paymentData.payment && 
                              paymentData.payment.amount && 
                              (paymentData.surchargeAmount || 
                               paymentData.payment.surchargeAmount);
    
    // Force includedSurcharge to true for registration payments with surcharge amount
    const includedSurcharge = (isRegistration && hasSurchargeAmount) || 
                             paymentData.includedSurcharge === true;
    
    if (includedSurcharge) {
      console.log("🔍 Client indicates surcharge is already included in amount");
    }
    
    // Determine payment type
    const paymentType = paymentData.paymentType || "registration";
    console.log(`🔍 Payment type: ${paymentType}`);
    
    // Skip card validation for existingCustomer payments
    if (paymentType === "existingCustomer") {
      // For existing customers, we only need customerId and payment details
      if (!paymentData.customerId) {
        console.error("❌ Missing customerId for existingCustomer payment");
        return res.status(400).json({
          success: false,
          error: "Customer ID is required for existing customer payments"
        });
      }
      
      if (!paymentData.payment || !paymentData.payment.amount) {
        console.error("❌ Missing payment amount for existingCustomer payment");
        return res.status(400).json({
          success: false,
          error: "Payment amount is required"
        });
      }
    } else {
      // For all other payment types, validate card and customer details
      // Validate card details
      if (!paymentData.card) {
        console.error("❌ Missing card details in request");
        return res.status(400).json({
          success: false,
          error: "Card details are required"
        });
      }
      
      // Check for required card fields
      const requiredCardFields = ['card_number', 'exp_month', 'exp_year', 'cvv'];
      const missingCardFields = requiredCardFields.filter(field => !paymentData.card[field]);
      
      if (missingCardFields.length > 0) {
        console.error(`❌ Missing required card fields: ${missingCardFields.join(', ')}`);
        return res.status(400).json({
          success: false,
          error: `Missing required card fields: ${missingCardFields.join(', ')}`
        });
      }
      
      // Validate customer details
      if (!paymentData.customer) {
        console.error("❌ Missing customer details in request");
        return res.status(400).json({
          success: false,
          error: "Customer details are required"
        });
      }
      
      // Check for required customer fields
      const requiredCustomerFields = ['email', 'name'];
      const missingCustomerFields = requiredCustomerFields.filter(field => !paymentData.customer[field]);
      
      if (missingCustomerFields.length > 0) {
        console.error(`❌ Missing required customer fields: ${missingCustomerFields.join(', ')}`);
        return res.status(400).json({
          success: false,
          error: `Missing required customer fields: ${missingCustomerFields.join(', ')}`
        });
      }
    }
    
    // Validate payment details for all payment types
    if (!paymentData.payment) {
      console.error("❌ Missing payment details in request");
      return res.status(400).json({
        success: false,
        error: "Payment details are required"
      });
    }
    
    // Check for required payment fields
    if (!paymentData.payment.amount) {
      console.error("❌ Missing payment amount in request");
      return res.status(400).json({
        success: false,
        error: "Payment amount is required"
      });
    }
    
    let result;
    
    switch (paymentType) {
      case "registration":
        // Full registration flow (create customer + charge)
        console.log("📦 Processing registration payment");
        result = await processRegistrationPayment({
          ...paymentData,
          includedSurcharge: true  // Force this to be true
        });
        break;
        
      case "oneTime":
      case "store":
      case "ticket":
      case "donation":
        // One-time payment (no customer creation)
        console.log("📦 Processing one-time payment");
        result = await processOneTimePayment(paymentData);
        break;
        
      case "existingCustomer":
        // Payment for existing customer
        console.log("📦 Processing payment for existing customer");
        result = await processExistingCustomerPayment(paymentData);
        break;
        
      default:
        console.error(`❌ Unknown payment type: ${paymentType}`);
        return res.status(400).json({
          success: false,
          error: `Unknown payment type: ${paymentType}`
        });
    }
    
    console.log("🔍 Payment result:", result);
    
    // Check if the payment was successful
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || "Payment processing failed"
      });
    }

    // Ensure consistent response format for successful payments
    return res.status(200).json({
      success: true,
      customerId: result.customerId,
      tokenId: result.tokenId,
      chargeId: result.chargeId,
      amount: parseFloat((result.amount || paymentData.payment.amount).toFixed(2)),
      subtotal: parseFloat((result.subtotal || result.amount || paymentData.payment.amount).toFixed(2)),
      surchargeAmount: parseFloat((result.surchargeAmount || 0).toFixed(2)),
      surchargeRate: parseFloat((result.surchargeRate || 0).toFixed(2)),
      surchargeType: result.surchargeType || "percentage",
      status: result.status || "Paid",
      isPartialPayment: result.isPartialPayment || false,
      requestedAmount: parseFloat((result.requestedAmount || result.amount || paymentData.payment.amount).toFixed(2)),
      message: result.isPartialPayment ? "Partial payment processed successfully" : "Payment processed successfully",
      data: result.data || result
    });
    
  } catch (error) {
    console.error(`❌ Payment processing error: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add this endpoint to test payment credentials
app.get("/test-credentials/:studioId", async (req, res) => {
  try {
    const studioId = req.params.studioId;
    console.log(`🔍 Testing payment credentials for studio ID: ${studioId}`);
    
    if (!studioId) {
      return res.status(400).json({
        success: false,
        error: "Studio ID is required"
      });
    }
    
    // Get the credentials
    const credentials = await getStudioPaymentCredentials(studioId);
    
    // Mask the API key for security
    const maskedCredentials = {
      ...credentials,
      apiKey: credentials.apiKey ? 
        credentials.apiKey.substring(0, 10) + "..." + 
        credentials.apiKey.substring(credentials.apiKey.length - 10) : null
    };
    
    return res.status(200).json({
      success: true,
      message: "Successfully retrieved payment credentials",
      credentials: maskedCredentials
    });
    
  } catch (error) {
    console.error(`❌ Error testing credentials: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add this endpoint to test charging a customer directly
app.post("/test-charge", async (req, res) => {
  try {
    const { studioId, customerId, amount, description, testMode } = req.body;
    
    if (!studioId || !customerId || !amount) {
      return res.status(400).json({
        success: false,
        error: "Studio ID, customer ID, and amount are required"
      });
    }
    
    console.log(`🔍 Testing charge for customer ${customerId} in studio ${studioId}`);
    
    // Get the credentials
    const credentials = await getStudioPaymentCredentials(studioId);
    
    // Process the charge
    const chargeResult = await processCharge(
      customerId,
      amount,
      description || "Test charge",
      credentials.apiKey,
      credentials.merchantCode,
      testMode !== false
    );
    
    return res.status(200).json({
      success: true,
      message: "Charge processed successfully",
      result: chargeResult
    });
    
  } catch (error) {
    console.error(`❌ Error testing charge: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add this endpoint to get PayArc API information
app.get("/payarc-info", async (req, res) => {
  try {
    const apiKey = req.query.apiKey;
    const merchantId = req.query.merchantId;
    const testMode = req.query.testMode !== 'false';
    
    if (!apiKey || !merchantId) {
      return res.status(400).json({
        success: false,
        error: "API key and merchant ID are required"
      });
    }
    
    // Use testapi for test mode
    const baseUrl = testMode ? 'https://testapi.payarc.net' : 'https://api.payarc.net';
    const url = `${baseUrl}/v1/merchants`;
    
    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Payarc-Version': '1.0',
      'Merchant-Code': merchantId,
      'Agent-Code': '500000'
    };
    
    try {
      const response = await axios.get(url, { headers });
      
      return res.status(200).json({
        success: true,
        message: "Successfully retrieved PayArc API information",
        data: response.data
      });
    } catch (apiError) {
      return res.status(500).json({
        success: false,
        error: "Error communicating with PayArc API",
        details: apiError.response?.data || apiError.message
      });
    }
    
  } catch (error) {
    console.error(`❌ Error getting PayArc info: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add endpoint for creating card tokens
app.post("/create-card-token", async (req, res) => {
  try {
    const { cardDetails, apiKey, merchantCode, testMode } = req.body;
    
    if (!cardDetails || !apiKey || !merchantCode) {
      return res.status(400).json({
        success: false,
        error: "Card details, API key, and merchant code are required"
      });
    }
    
    console.log("🔍 Creating card token...");
    const result = await createCardToken(cardDetails, apiKey, merchantCode, testMode !== false);
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        details: result.details
      });
    }
    
    return res.status(200).json({
      success: true,
      tokenId: result.tokenId,
      data: result.data
    });
    
  } catch (error) {
    console.error(`❌ Error creating card token: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add endpoint for attaching payment methods
app.post("/attach-payment-method", async (req, res) => {
  try {
    const { customerId, tokenId, apiKey, merchantCode, testMode } = req.body;
    
    if (!customerId || !tokenId || !apiKey || !merchantCode) {
      return res.status(400).json({
        success: false,
        error: "Customer ID, token ID, API key, and merchant code are required"
      });
    }
    
    console.log("🔍 Attaching payment method to customer...");
    const result = await attachPaymentMethod(customerId, tokenId, apiKey, merchantCode, testMode !== false);
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        details: result.details
      });
    }
    
    // Log the full response to see its structure
    console.log("🔍 Full PayArc response:", JSON.stringify(result.data, null, 2));
    
    // Extract payment method details from the response - using the correct path
    const cardData = result.data?.data?.card?.data?.[0];
    const paymentMethodId = cardData?.id;
    const cardBrand = cardData?.brand === 'V' ? 'Visa' : cardData?.brand;
    
    console.log("🔍 Extracted payment method details:", {
      paymentMethodId,
      cardBrand,
      responseStructure: {
        hasData: !!result.data?.data,
        hasCardData: !!result.data?.data?.card?.data,
        cardDataLength: result.data?.data?.card?.data?.length
      }
    });
    
    if (!paymentMethodId) {
      console.error("❌ No payment method ID found in response:", result.data);
      return res.status(400).json({
        success: false,
        error: "Failed to get payment method ID from response",
        details: result.data
      });
    }
    
    return res.status(200).json({
      success: true,
      paymentMethodId,
      cardBrand: cardBrand || 'Unknown',
      data: result.data
    });
    
  } catch (error) {
    console.error(`❌ Error attaching payment method: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add endpoint for creating customers
app.post("/create-customer", async (req, res) => {
  try {
    const { firstName, lastName, email, phone, apiKey, merchantCode, testMode } = req.body;
    
    if (!email || !apiKey || !merchantCode) {
      return res.status(400).json({
        success: false,
        error: "Email, API key, and merchant code are required"
      });
    }
    
    const customerDetails = {
      first_name: firstName,
      last_name: lastName,
      email,
      phone
    };
    
    console.log("🔍 Creating customer...");
    const result = await createCustomer(customerDetails, apiKey, merchantCode, testMode !== false);
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        details: result.details
      });
    }
    
    return res.status(200).json({
      success: true,
      customerId: result.customerId,
      data: result.data
    });
    
  } catch (error) {
    console.error(`❌ Error creating customer: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Export the Express app wrapped in onRequest
exports.processPayments = onRequest({
  region: "us-central1",
  memory: "512MiB", 
  minInstances: 0,  // Scale to zero when not in use to save costs
  maxInstances: 10,
  timeoutSeconds: 60,
  invoker: "public" // Allow unauthenticated access
}, app);

/**
 * Masks sensitive data for logging
 */
function maskSensitiveData(data) {
  if (!data) return data;
  
  // Create a deep copy to avoid modifying the original
  const maskedData = JSON.parse(JSON.stringify(data));
  
  // Mask card details if present
  if (maskedData.card) {
    if (maskedData.card.card_number) {
      maskedData.card.card_number = maskedData.card.card_number.length > 4 
        ? "****" + maskedData.card.card_number.slice(-4) 
        : "****";
    }
    
    if (maskedData.card.cvv) {
      maskedData.card.cvv = "***";
    }
  }
  
  // Mask any other sensitive fields
  if (maskedData.apiKey) {
    maskedData.apiKey = maskedData.apiKey.substring(0, 8) + "..." + 
      (maskedData.apiKey.length > 16 ? maskedData.apiKey.substring(maskedData.apiKey.length - 8) : "");
  }
  
  return maskedData;
}
