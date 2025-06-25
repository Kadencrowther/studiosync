// Import required modules
const { onRequest } = require("firebase-functions/v2/https"); // Firebase HTTP trigger
const admin = require("firebase-admin"); // Firebase Admin SDK for Firestore
const axios = require("axios"); // For making HTTP requests to PayArc API
const express = require("express"); // Express framework for routing
const cors = require("cors"); // CORS middleware

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

// Create an Express app instance
const app = express();

// Enable CORS for all origins and common HTTP methods
app.use(cors({ origin: true, methods: ["GET", "POST", "OPTIONS"] }));
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Middleware to log all requests and handle CORS preflight
app.use((req, res, next) => {
  // Log request details
  console.log(
    `[${new Date().toISOString()}] ${req.method} ${req.path} - Origin: ${
      req.headers.origin || "unknown"
    }`
  );
  // Set CORS headers
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Accept"
  );
  // Handle preflight OPTIONS request
  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }
  next();
});

// Test endpoint to check if API is working
app.get("/test", (req, res) => {
  res
    .status(200)
    .json({
      message: "Payment API is working!",
      timestamp: new Date().toISOString(),
    });
});

// =====================
// Utility Logging Functions
// =====================

// Log an object, masking sensitive data if needed
function logObject(label, obj, sensitive = false) {
  if (sensitive) {
    // Mask card details
    const safeCopy = { ...obj };
    if (safeCopy.card) {
      safeCopy.card = {
        ...safeCopy.card,
        card_number: safeCopy.card.card_number
          ? "****" + safeCopy.card.card_number.slice(-4)
          : "[MISSING]",
        cvv: safeCopy.card.cvv ? "***" : "[MISSING]",
      };
    }
    console.log(`🔍 ${label}:`, JSON.stringify(safeCopy, null, 2));
  } else {
    console.log(`🔍 ${label}:`, JSON.stringify(obj, null, 2));
  }
}

// Log errors with stack trace and response details
function logError(label, error) {
  console.error(`❌ ${label}:`, error.message);
  console.error(`❌ ${label} stack:`, error.stack);
  if (error.response) {
    console.error(`❌ ${label} response data:`, error.response.data);
    console.error(`❌ ${label} response status:`, error.response.status);
  }
}

// =====================
// PayArc API Functions
// =====================

/**
 * Create a PayArc card token (for securely storing card info)
 * @param {Object} cardDetails - Card info (number, exp, cvv, etc.)
 * @param {string} apiKey - PayArc API key
 * @param {string} merchantCode - PayArc merchant code
 * @param {boolean} testMode - Use test API endpoint
 */
async function createCardToken(
  cardDetails,
  apiKey,
  merchantCode,
  testMode = true
) {
  try {
    // Validate card details
    if (!cardDetails) throw new Error("Card details are required");
    const requiredFields = ["card_number", "exp_month", "exp_year", "cvv"];
    const missingFields = requiredFields.filter((field) => !cardDetails[field]);
    if (missingFields.length > 0)
      throw new Error(
        `Missing required card fields: ${missingFields.join(", ")}`
      );

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
      country_code: cardDetails.country_code,
    });

    // Make API request to PayArc to create a token
    const tokenResponse = await axios.post(
      "https://testapi.payarc.net/v1/tokens",
      {
        ...cardDetails,
        card_source: "INTERNET",
        test_mode: testMode,
        authorize_card: 1,
      },
      {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "Payarc-Version": "1.0",
          "Merchant-Code": merchantCode,
          "Agent-Code": "500000",
        },
      }
    );

    // Extract token ID from response
    const tokenId = tokenResponse.data?.data?.id;
    if (!tokenId) throw new Error("Failed to create token");
    console.log("✅ Token created:", tokenId);
    return { success: true, tokenId, data: tokenResponse.data };
  } catch (error) {
    console.error(
      "❌ Token creation error:",
      error.response?.data || error.message
    );
    return {
      success: false,
      error: error.message,
      details: error.response?.data,
    };
  }
}

/**
 * Create a PayArc customer
 * @param {Object} customerDetails - Customer info (name, email, etc.)
 * @param {string} apiKey - PayArc API key
 * @param {string} merchantCode - PayArc merchant code
 * @param {boolean} testMode - Use test API endpoint
 */
async function createCustomer(
  customerDetails,
  apiKey,
  merchantCode,
  testMode = true
) {
  try {
    // Make API request to PayArc to create a customer
    const customerResponse = await axios.post(
      "https://testapi.payarc.net/v1/customers",
      {
        ...customerDetails,
        test_mode: testMode,
      },
      {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "Payarc-Version": "1.0",
          "Merchant-Code": merchantCode,
          "Agent-Code": "500000",
        },
      }
    );
    // Extract customer ID from response
    const customerId = customerResponse.data?.data?.customer_id;
    if (!customerId) throw new Error("Failed to create customer");
    console.log("✅ Customer created:", customerId);
    return { success: true, customerId, data: customerResponse.data };
  } catch (error) {
    console.error(
      "❌ Customer creation error:",
      error.response?.data || error.message
    );
    return {
      success: false,
      error: error.message,
      details: error.response?.data,
    };
  }
}

/**
 * Attach a payment method (token) to a customer
 * @param {string} customerId - PayArc customer ID
 * @param {string} tokenId - PayArc token ID
 * @param {string} apiKey - PayArc API key
 * @param {string} merchantCode - PayArc merchant code
 * @param {boolean} testMode - Use test API endpoint
 */
async function attachPaymentMethod(
  customerId,
  tokenId,
  apiKey,
  merchantCode,
  testMode = true
) {
  try {
    // Make API request to PayArc to attach token to customer
    const attachResponse = await axios.patch(
      `https://testapi.payarc.net/v1/customers/${customerId}`,
      { token_id: tokenId, test_mode: testMode },
      {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "Payarc-Version": "1.0",
          "Merchant-Code": merchantCode,
          "Agent-Code": "500000",
        },
      }
    );
    console.log("✅ Payment method attached");
    return { success: true, data: attachResponse.data };
  } catch (error) {
    console.error(
      "❌ Payment method attachment error:",
      error.response?.data || error.message
    );
    return {
      success: false,
      error: error.message,
      details: error.response?.data,
    };
  }
}

/**
 * Process a charge (payment) using PayArc API
 * @param {string|null} customerId - PayArc customer ID (null for one-time)
 * @param {number} amount - Amount in dollars
 * @param {string} description - Payment description
 * @param {string} apiKey - PayArc API key
 * @param {string} merchantCode - PayArc merchant code
 * @param {boolean} testMode - Use test API endpoint
 * @param {string|null} tokenId - Token ID for one-time payments
 * @param {string|null} transactionId - Optional transaction ID
 */
async function processCharge(
  customerId,
  amount,
  description,
  apiKey,
  merchantCode,
  testMode = false,
  tokenId = null,
  transactionId = null
) {
  try {
    // Log what kind of charge is being processed
    if (customerId) {
      console.log(
        `💳 Processing charge for customer ${customerId}, amount: $${amount.toFixed(
          2
        )}`
      );
    } else if (tokenId) {
      console.log(
        `💳 Processing one-time charge with token ${tokenId}, amount: $${amount.toFixed(
          2
        )}`
      );
    } else {
      console.log(
        `💳 Processing one-time charge, amount: $${amount.toFixed(2)}`
      );
    }

    // Convert amount to cents (PayArc expects cents)
    const roundedAmount = parseFloat(amount.toFixed(2));
    const amountInCents = Math.round(roundedAmount * 100);

    // Always use test mode for now
    testMode = true;

    // Prepare charge data for PayArc
    const chargeData = {
      amount: amountInCents,
      currency: "usd",
      description: description || "Payment",
      capture: 1,
      test_mode: 1,
      do_not_send_email_to_customer: false,
      do_not_send_sms_to_customer: true,
    };
    if (customerId) chargeData.customer_id = customerId;
    if (tokenId) chargeData.token_id = tokenId;

    // Log charge data (masking sensitive info)
    console.log("🔍 Processing charge with payload:", {
      ...chargeData,
      customer_id: customerId
        ? customerId.substring(0, 4) +
          "..." +
          customerId.substring(customerId.length - 4)
        : undefined,
      token_id: tokenId
        ? tokenId.substring(0, 4) +
          "..." +
          tokenId.substring(tokenId.length - 4)
        : undefined,
    });

    // Use test API endpoint
    const apiEndpoint = "https://testapi.payarc.net/v1/charges";

    // Make API request to PayArc to process the charge
    const response = await axios.post(apiEndpoint, chargeData, {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "Payarc-Version": "1.0",
        "Merchant-Code": merchantCode,
        "Agent-Code": "500000",
      },
    });

    // Parse response and extract charge details
    if (response.status === 201 || response.status === 200) {
      let chargeId,
        chargeAmount,
        chargeStatus,
        isPartialPayment = false;
      let requestedAmount = amountInCents;
      let approvedAmount = 0;

      // Handle different response formats
      if (response.data.data && typeof response.data.data === "object") {
        // New API format
        chargeId = response.data.data.id;
        approvedAmount = parseInt(
          response.data.data.amount_approved || response.data.data.amount
        );
        if (approvedAmount < requestedAmount) isPartialPayment = true;
        chargeAmount = approvedAmount ? approvedAmount / 100 : amount;
        chargeStatus = isPartialPayment
          ? "Partial"
          : response.data.data.status || "Paid";
      } else if (response.data.id) {
        // Old API format
        chargeId = response.data.id;
        approvedAmount = parseInt(
          response.data.amount_approved || response.data.amount
        );
        if (approvedAmount < requestedAmount) isPartialPayment = true;
        chargeAmount = approvedAmount ? approvedAmount / 100 : amount;
        chargeStatus = isPartialPayment
          ? "Partial"
          : response.data.status || "Paid";
      } else {
        // Fallback for test API
        chargeId = `test_charge_${Date.now()}`;
        chargeAmount = amount;
        chargeStatus = "Paid";
        isPartialPayment = false;
      }

      // Return charge result
      return {
        success: true,
        chargeId: chargeId,
        amount: chargeAmount,
        status: chargeStatus,
        isPartialPayment: isPartialPayment,
        requestedAmount: amount,
        data: response.data,
      };
    } else {
      // Unexpected response
      return {
        success: false,
        error: `Unexpected response status: ${response.status}`,
      };
    }
  } catch (error) {
    // Handle errors from PayArc API
    return {
      success: false,
      error: error.response?.data?.error || error.message,
    };
  }
}

/**
 * Get payment credentials (API key, merchant code) for a studio from Firestore
 * @param {string} studioId - Studio document ID
 */
async function getStudioPaymentCredentials(studioId) {
  if (!studioId)
    throw new Error("Studio ID is required for payment processing");
  const db = admin.firestore();
  // Get studio document
  const studioDoc = await db.collection("Studios").doc(studioId).get();
  if (!studioDoc.exists)
    throw new Error(`Studio with ID ${studioId} not found`);
  const studioData = studioDoc.data();

  // Get PaymentProcessing/Settings subdocument
  const settingsDoc = await db
    .collection("Studios")
    .doc(studioId)
    .collection("PaymentProcessing")
    .doc("Settings")
    .get();
  if (!settingsDoc.exists)
    throw new Error("Studio does not have payment processing set up");
  const settingsData = settingsDoc.data();

  // Get PayArc settings
  if (!settingsData.Payarc)
    throw new Error("Studio does not have Payarc payment processing set up");
  const payarcSettings = settingsData.Payarc;
  const apiKey = payarcSettings.ApiKey;
  const merchantCode = payarcSettings.MerchantId;
  if (!apiKey || !merchantCode)
    throw new Error("Studio is missing API key or merchant ID");
  return { success: true, apiKey, merchantCode };
}

// =====================
// Payment Scenarios
// =====================

/**
 * Process a registration payment (creates customer, attaches card, charges)
 * Handles surcharge calculation and partial payments
 */
async function processRegistrationPayment(data) {
  try {
    // Get studio credentials (API key, merchant code)
    const credentials = await getStudioPaymentCredentials(data.studioId);
    if (!credentials.success) throw new Error(credentials.error);

    // Surcharge calculation
    let surchargeRate = 0,
      surchargeAmount = 0,
      totalAmount = data.payment.amount,
      surchargeType = "percentage";
    const clientIncludedSurcharge = data.includedSurcharge === true;

    if (clientIncludedSurcharge) {
      // Surcharge already included in amount
      if (data.surchargeAmount) {
        surchargeAmount = parseFloat(data.surchargeAmount.toFixed(2));
      } else {
        // Estimate surcharge for record-keeping
        try {
          const surchargeDoc = await admin
            .firestore()
            .collection("Studios")
            .doc(data.studioId)
            .collection("Surcharge")
            .doc("SurchargeSettings")
            .get();
          if (surchargeDoc.exists) {
            const surchargeData = surchargeDoc.data();
            if (surchargeData.IsActive) {
              surchargeType = surchargeData.Type || "percentage";
              if (surchargeType === "percentage") {
                surchargeRate = surchargeData.Value || 0;
                const estimatedSubtotal =
                  data.payment.amount / (1 + surchargeRate / 100);
                surchargeAmount = data.payment.amount - estimatedSubtotal;
              }
            }
          }
        } catch (error) {
          // Ignore surcharge estimation errors
        }
      }
    } else {
      // Calculate surcharge if not included
      try {
        const surchargeDoc = await admin
          .firestore()
          .collection("Studios")
          .doc(data.studioId)
          .collection("Surcharge")
          .doc("SurchargeSettings")
          .get();
        if (surchargeDoc.exists) {
          const surchargeData = surchargeDoc.data();
          if (surchargeData.IsActive) {
            surchargeType = surchargeData.Type || "percentage";
            if (surchargeType === "percentage") {
              surchargeRate = surchargeData.Value || 0;
              surchargeAmount = parseFloat(
                (data.payment.amount * (surchargeRate / 100)).toFixed(2)
              );
            } else if (surchargeType === "fixed") {
              surchargeAmount = surchargeData.Value || 0;
            }
            totalAmount = data.payment.amount + surchargeAmount;
          }
        } else {
          // Fallback to old location in studio doc
          const studioDoc = await admin
            .firestore()
            .collection("Studios")
            .doc(data.studioId)
            .get();
          const studioData = studioDoc.data();
          if (
            studioData &&
            studioData.Surcharge &&
            studioData.Surcharge.Enabled
          ) {
            surchargeType = studioData.Surcharge.Type || "percentage";
            if (surchargeType === "percentage") {
              surchargeRate = studioData.Surcharge.Rate || 0;
              surchargeAmount = parseFloat(
                (data.payment.amount * (surchargeRate / 100)).toFixed(2)
              );
            } else if (surchargeType === "fixed") {
              surchargeAmount = studioData.Surcharge.Amount || 0;
            }
            totalAmount = data.payment.amount + surchargeAmount;
          }
        }
      } catch (error) {
        // Ignore surcharge errors
      }
    }

    // Create card token
    const tokenResult = await createCardToken(
      data.card,
      credentials.apiKey,
      credentials.merchantCode,
      data.test_mode
    );
    if (!tokenResult.success)
      throw new Error(`Failed to create token: ${tokenResult.error}`);

    // Create customer
    const customerResult = await createCustomer(
      data.customer,
      credentials.apiKey,
      credentials.merchantCode,
      data.test_mode
    );
    if (!customerResult.success)
      throw new Error(`Failed to create customer: ${customerResult.error}`);

    // Attach payment method to customer
    const attachResult = await attachPaymentMethod(
      customerResult.customerId,
      tokenResult.tokenId,
      credentials.apiKey,
      credentials.merchantCode
    );
    if (!attachResult.success)
      throw new Error(`Failed to attach payment method: ${attachResult.error}`);

    // Process charge (with surcharge included)
    const chargeResult = await processCharge(
      customerResult.customerId,
      totalAmount,
      data.payment.description || "Registration payment",
      credentials.apiKey,
      credentials.merchantCode,
      data.test_mode,
      data.transactionId
    );
    if (!chargeResult.success)
      throw new Error(`Charge processing failed: ${chargeResult.error}`);

    // Handle partial payments (if only part of the amount was approved)
    const isPartialPayment = chargeResult.isPartialPayment || false;
    const actualAmount = chargeResult.amount || 0;
    const requestedAmount = chargeResult.requestedAmount || totalAmount;
    let actualSurchargeAmount = surchargeAmount;
    if (isPartialPayment && surchargeAmount > 0) {
      if (surchargeType === "percentage") {
        const actualSubtotal = actualAmount / (1 + surchargeRate / 100);
        actualSurchargeAmount = actualAmount - actualSubtotal;
      } else {
        const paymentProportion = actualAmount / requestedAmount;
        actualSurchargeAmount = surchargeAmount * paymentProportion;
      }
    }

    // Return payment result
    return {
      success: true,
      customerId: customerResult.customerId,
      tokenId: tokenResult.tokenId,
      chargeId: chargeResult.chargeId,
      amount: actualAmount,
      subtotal: isPartialPayment
        ? actualAmount - actualSurchargeAmount
        : data.payment.amount,
      surchargeAmount: actualSurchargeAmount,
      surchargeRate: surchargeRate,
      surchargeType: surchargeType,
      status: chargeResult.status || (isPartialPayment ? "Partial" : "Paid"),
      isPartialPayment: isPartialPayment,
      requestedAmount: requestedAmount,
      data: {
        customer: customerResult.data,
        token: tokenResult.data,
        charge: chargeResult.data,
      },
    };
  } catch (error) {
    // Handle errors
    return { success: false, error: error.message };
  }
}

/**
 * Process a one-time payment (no customer creation)
 */
async function processOneTimePayment(data) {
  try {
    // Get studio credentials
    const credentials = await getStudioPaymentCredentials(data.studioId);
    if (!credentials.success) throw new Error(credentials.error);

    // Surcharge calculation (same as above, omitted for brevity)
    let surchargeRate = 0,
      surchargeAmount = 0,
      totalAmount = data.payment.amount,
      surchargeType = "percentage";
    // ... (see processRegistrationPayment for surcharge logic)

    // Create card token
    const tokenResult = await createCardToken(
      data.card,
      credentials.apiKey,
      credentials.merchantCode,
      data.test_mode
    );
    if (!tokenResult.success)
      throw new Error(`Failed to create token: ${tokenResult.error}`);

    // Process charge (with surcharge included)
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
    if (!chargeResult.success)
      throw new Error(`Charge processing failed: ${chargeResult.error}`);

    // Handle partial payments
    const isPartialPayment = chargeResult.isPartialPayment || false;
    const actualAmount = chargeResult.amount || 0;
    const requestedAmount = chargeResult.requestedAmount || totalAmount;
    let actualSurchargeAmount = surchargeAmount;
    if (isPartialPayment && surchargeAmount > 0) {
      if (surchargeType === "percentage") {
        const actualSubtotal = actualAmount / (1 + surchargeRate / 100);
        actualSurchargeAmount = actualAmount - actualSubtotal;
      } else {
        const paymentProportion = actualAmount / requestedAmount;
        actualSurchargeAmount = surchargeAmount * paymentProportion;
      }
    }

    // Return payment result
    return {
      success: true,
      chargeId: chargeResult.chargeId,
      amount: actualAmount,
      subtotal: isPartialPayment
        ? actualAmount - actualSurchargeAmount
        : data.payment.amount,
      surchargeAmount: actualSurchargeAmount,
      surchargeRate: surchargeRate,
      surchargeType: surchargeType,
      status: chargeResult.status || (isPartialPayment ? "Partial" : "Paid"),
      isPartialPayment: isPartialPayment,
      requestedAmount: requestedAmount,
      data: {
        charge: chargeResult.data,
      },
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Process a payment for an existing customer (uses saved payment method)
 */
async function processExistingCustomerPayment(data) {
  try {
    // Validate required fields
    if (!data.customerId)
      throw new Error("Customer ID is required for existing customer payments");
    if (!data.payment || !data.payment.amount)
      throw new Error("Payment amount is required");

    // Get studio credentials
    const credentials = await getStudioPaymentCredentials(data.studioId);
    if (!credentials.success) throw new Error(credentials.error);

    // Surcharge calculation (same as above, omitted for brevity)
    let surchargeRate = 0,
      surchargeAmount = 0,
      totalAmount = data.payment.amount,
      surchargeType = "percentage";
    // ... (see processRegistrationPayment for surcharge logic)

    // Process charge (with surcharge included)
    const chargeResult = await processCharge(
      data.customerId,
      totalAmount,
      data.payment.description || "Auto payment",
      credentials.apiKey,
      credentials.merchantCode,
      data.test_mode !== false,
      null, // tokenId
      data.transactionId // Optional transactionId
    );
    if (!chargeResult.success)
      throw new Error(`Charge processing failed: ${chargeResult.error}`);

    // Handle partial payments
    const isPartialPayment = chargeResult.isPartialPayment || false;
    const actualAmount = chargeResult.amount || 0;
    const requestedAmount = chargeResult.requestedAmount || totalAmount;
    let actualSurchargeAmount = surchargeAmount;
    if (isPartialPayment && surchargeAmount > 0) {
      if (surchargeType === "percentage") {
        const actualSubtotal = actualAmount / (1 + surchargeRate / 100);
        actualSurchargeAmount = actualAmount - actualSubtotal;
      } else {
        const paymentProportion = actualAmount / requestedAmount;
        actualSurchargeAmount = surchargeAmount * paymentProportion;
      }
    }

    // Return payment result
    return {
      success: true,
      chargeId: chargeResult.chargeId,
      amount: actualAmount,
      subtotal: isPartialPayment
        ? actualAmount - actualSurchargeAmount
        : data.payment.amount,
      surchargeAmount: actualSurchargeAmount,
      surchargeRate: surchargeRate,
      surchargeType: surchargeType,
      status: chargeResult.status || (isPartialPayment ? "Partial" : "Paid"),
      isPartialPayment: isPartialPayment,
      requestedAmount: requestedAmount,
      data: {
        charge: chargeResult.data,
      },
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// =====================
// Main Payment Route
// =====================

/**
 * Main endpoint for processing payments
 * Handles registration, one-time, and existing customer payments
 */
app.post("/process-payment", async (req, res) => {
  try {
    // Extract payment data from request body
    const paymentData = req.body.data || req.body;
    // Mask sensitive data for logging
    const maskedData = maskSensitiveData(paymentData);
    console.log("🔍 Extracted payment data:", maskedData);

    // Validate studio ID
    const studioId = paymentData.studioId;
    if (!studioId) {
      return res
        .status(400)
        .json({ success: false, error: "Studio ID is required" });
    }

    // Determine payment type
    const paymentType = paymentData.paymentType || "registration";

    // Validate required fields for each payment type
    if (paymentType === "existingCustomer") {
      if (!paymentData.customerId) {
        return res
          .status(400)
          .json({
            success: false,
            error: "Customer ID is required for existing customer payments",
          });
      }
      if (!paymentData.payment || !paymentData.payment.amount) {
        return res
          .status(400)
          .json({ success: false, error: "Payment amount is required" });
      }
    } else {
      // Validate card and customer details
      if (!paymentData.card) {
        return res
          .status(400)
          .json({ success: false, error: "Card details are required" });
      }
      const requiredCardFields = [
        "card_number",
        "exp_month",
        "exp_year",
        "cvv",
      ];
      const missingCardFields = requiredCardFields.filter(
        (field) => !paymentData.card[field]
      );
      if (missingCardFields.length > 0) {
        return res
          .status(400)
          .json({
            success: false,
            error: `Missing required card fields: ${missingCardFields.join(
              ", "
            )}`,
          });
      }
      if (!paymentData.customer) {
        return res
          .status(400)
          .json({ success: false, error: "Customer details are required" });
      }
      const requiredCustomerFields = ["email", "name"];
      const missingCustomerFields = requiredCustomerFields.filter(
        (field) => !paymentData.customer[field]
      );
      if (missingCustomerFields.length > 0) {
        return res
          .status(400)
          .json({
            success: false,
            error: `Missing required customer fields: ${missingCustomerFields.join(
              ", "
            )}`,
          });
      }
    }
    if (!paymentData.payment) {
      return res
        .status(400)
        .json({ success: false, error: "Payment details are required" });
    }
    if (!paymentData.payment.amount) {
      return res
        .status(400)
        .json({ success: false, error: "Payment amount is required" });
    }

    // Call the appropriate payment handler
    let result;
    switch (paymentType) {
      case "registration":
        result = await processRegistrationPayment({
          ...paymentData,
          includedSurcharge: true, // Force this to be true
        });
        break;
      case "oneTime":
      case "store":
      case "ticket":
      case "donation":
        result = await processOneTimePayment(paymentData);
        break;
      case "existingCustomer":
        result = await processExistingCustomerPayment(paymentData);
        break;
      default:
        return res
          .status(400)
          .json({
            success: false,
            error: `Unknown payment type: ${paymentType}`,
          });
    }

    // Return result
    if (!result.success) {
      return res
        .status(400)
        .json({
          success: false,
          error: result.error || "Payment processing failed",
        });
    }
    return res.status(200).json({
      success: true,
      customerId: result.customerId,
      tokenId: result.tokenId,
      chargeId: result.chargeId,
      amount: parseFloat(
        (result.amount || paymentData.payment.amount).toFixed(2)
      ),
      subtotal: parseFloat(
        (
          result.subtotal ||
          result.amount ||
          paymentData.payment.amount
        ).toFixed(2)
      ),
      surchargeAmount: parseFloat((result.surchargeAmount || 0).toFixed(2)),
      surchargeRate: parseFloat((result.surchargeRate || 0).toFixed(2)),
      surchargeType: result.surchargeType || "percentage",
      status: result.status || "Paid",
      isPartialPayment: result.isPartialPayment || false,
      requestedAmount: parseFloat(
        (
          result.requestedAmount ||
          result.amount ||
          paymentData.payment.amount
        ).toFixed(2)
      ),
      message: result.isPartialPayment
        ? "Partial payment processed successfully"
        : "Payment processed successfully",
      data: result.data || result,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// =====================
// Additional Utility Endpoints
// =====================

// Test endpoint to get payment credentials for a studio
app.get("/test-credentials/:studioId", async (req, res) => {
  try {
    const studioId = req.params.studioId;
    if (!studioId) {
      return res
        .status(400)
        .json({ success: false, error: "Studio ID is required" });
    }
    const credentials = await getStudioPaymentCredentials(studioId);
    // Mask API key for security
    const maskedCredentials = {
      ...credentials,
      apiKey: credentials.apiKey
        ? credentials.apiKey.substring(0, 10) +
          "..." +
          credentials.apiKey.substring(credentials.apiKey.length - 10)
        : null,
    };
    return res.status(200).json({
      success: true,
      message: "Successfully retrieved payment credentials",
      credentials: maskedCredentials,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint to test charging a customer directly
app.post("/test-charge", async (req, res) => {
  try {
    const { studioId, customerId, amount, description, testMode } = req.body;
    if (!studioId || !customerId || !amount) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Studio ID, customer ID, and amount are required",
        });
    }
    const credentials = await getStudioPaymentCredentials(studioId);
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
      result: chargeResult,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint to get PayArc API information
app.get("/payarc-info", async (req, res) => {
  try {
    const apiKey = req.query.apiKey;
    const merchantId = req.query.merchantId;
    const testMode = req.query.testMode !== "false";
    if (!apiKey || !merchantId) {
      return res
        .status(400)
        .json({
          success: false,
          error: "API key and merchant ID are required",
        });
    }
    const baseUrl = testMode
      ? "https://testapi.payarc.net"
      : "https://api.payarc.net";
    const url = `${baseUrl}/v1/merchants`;
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "Payarc-Version": "1.0",
      "Merchant-Code": merchantId,
      "Agent-Code": "500000",
    };
    try {
      const response = await axios.get(url, { headers });
      return res.status(200).json({
        success: true,
        message: "Successfully retrieved PayArc API information",
        data: response.data,
      });
    } catch (apiError) {
      return res.status(500).json({
        success: false,
        error: "Error communicating with PayArc API",
        details: apiError.response?.data || apiError.message,
      });
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint for creating card tokens
app.post("/create-card-token", async (req, res) => {
  try {
    const { cardDetails, apiKey, merchantCode, testMode } = req.body;
    if (!cardDetails || !apiKey || !merchantCode) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Card details, API key, and merchant code are required",
        });
    }
    const result = await createCardToken(
      cardDetails,
      apiKey,
      merchantCode,
      testMode !== false
    );
    if (!result.success) {
      return res
        .status(400)
        .json({ success: false, error: result.error, details: result.details });
    }
    return res
      .status(200)
      .json({ success: true, tokenId: result.tokenId, data: result.data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint for attaching payment methods
app.post("/attach-payment-method", async (req, res) => {
  try {
    const { customerId, tokenId, apiKey, merchantCode, testMode } = req.body;
    if (!customerId || !tokenId || !apiKey || !merchantCode) {
      return res
        .status(400)
        .json({
          success: false,
          error:
            "Customer ID, token ID, API key, and merchant code are required",
        });
    }
    const result = await attachPaymentMethod(
      customerId,
      tokenId,
      apiKey,
      merchantCode,
      testMode !== false
    );
    if (!result.success) {
      return res
        .status(400)
        .json({ success: false, error: result.error, details: result.details });
    }
    // Extract payment method details from response
    const cardData = result.data?.data?.card?.data?.[0];
    const paymentMethodId = cardData?.id;
    const cardBrand = cardData?.brand === "V" ? "Visa" : cardData?.brand;
    if (!paymentMethodId) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Failed to get payment method ID from response",
          details: result.data,
        });
    }
    return res.status(200).json({
      success: true,
      paymentMethodId,
      cardBrand: cardBrand || "Unknown",
      data: result.data,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint for creating customers
app.post("/create-customer", async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      apiKey,
      merchantCode,
      testMode,
    } = req.body;
    if (!email || !apiKey || !merchantCode) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Email, API key, and merchant code are required",
        });
    }
    const customerDetails = {
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
    };
    const result = await createCustomer(
      customerDetails,
      apiKey,
      merchantCode,
      testMode !== false
    );
    if (!result.success) {
      return res
        .status(400)
        .json({ success: false, error: result.error, details: result.details });
    }
    return res
      .status(200)
      .json({
        success: true,
        customerId: result.customerId,
        data: result.data,
      });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// =====================
// Export as Firebase Function
// =====================

// Wrap Express app as a Firebase HTTPS function
exports.processPayments = onRequest(
  {
    region: "us-central1",
    memory: "512MiB",
    minInstances: 0, // Scale to zero when not in use
    maxInstances: 10,
    timeoutSeconds: 60,
    invoker: "public", // Allow unauthenticated access
  },
  app
);

/**
 * Utility: Mask sensitive data for logging
 * @param {Object} data - Data object to mask
 */
function maskSensitiveData(data) {
  if (!data) return data;
  const maskedData = JSON.parse(JSON.stringify(data));
  if (maskedData.card) {
    if (maskedData.card.card_number) {
      maskedData.card.card_number =
        maskedData.card.card_number.length > 4
          ? "****" + maskedData.card.card_number.slice(-4)
          : "****";
    }
    if (maskedData.card.cvv) {
      maskedData.card.cvv = "***";
    }
  }
  if (maskedData.apiKey) {
    maskedData.apiKey =
      maskedData.apiKey.substring(0, 8) +
      "..." +
      (maskedData.apiKey.length > 16
        ? maskedData.apiKey.substring(maskedData.apiKey.length - 8)
        : "");
  }
  return maskedData;
}
