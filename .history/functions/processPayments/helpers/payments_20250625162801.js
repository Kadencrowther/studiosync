const admin = require("firebase-admin");
const axios = require("axios");

// Helper: Mask sensitive data for logging
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

// Logging helpers
function logObject(label, obj, sensitive = false) {
  if (sensitive) {
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

function logError(label, error) {
  console.error(`❌ ${label}:`, error.message);
  console.error(`❌ ${label} stack:`, error.stack);
  if (error.response) {
    console.error(`❌ ${label} response data:`, error.response.data);
    console.error(`❌ ${label} response status:`, error.response.status);
  }
}

/**
 * Creates a PayArc token for a credit card
 */
async function createCardToken(
  cardDetails,
  apiKey,
  merchantCode,
  testMode = true
) {
  try {
    console.log("🔍 Creating card token...");
    if (!cardDetails) throw new Error("Card details are required");
    const requiredFields = ["card_number", "exp_month", "exp_year", "cvv"];
    const missingFields = requiredFields.filter((field) => !cardDetails[field]);
    if (missingFields.length > 0) {
      throw new Error(
        `Missing required card fields: ${missingFields.join(", ")}`
      );
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
      country_code: cardDetails.country_code,
    });
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
 * Creates a PayArc customer
 */
async function createCustomer(
  customerDetails,
  apiKey,
  merchantCode,
  testMode = true
) {
  try {
    if (!customerDetails || !customerDetails.email) {
      throw new Error("Customer details with email are required");
    }
    const response = await axios.post(
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
    const customerId = response.data?.data?.id;
    if (!customerId) throw new Error("Failed to create customer");
    return { success: true, customerId, data: response.data };
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
 * Attaches a payment method (token) to a customer
 */
async function attachPaymentMethod(
  customerId,
  tokenId,
  apiKey,
  merchantCode,
  testMode = true
) {
  try {
    if (!customerId || !tokenId) {
      throw new Error("Customer ID and token ID are required");
    }
    const response = await axios.post(
      `https://testapi.payarc.net/v1/customers/${customerId}/cards`,
      {
        token_id: tokenId,
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
    return { success: true, data: response.data };
  } catch (error) {
    console.error(
      "❌ Attach payment method error:",
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
 * Processes a charge for a customer
 */
async function processCharge(
  customerId,
  amount,
  description,
  apiKey,
  merchantCode,
  testMode = true
) {
  try {
    if (!customerId || !amount) {
      throw new Error("Customer ID and amount are required");
    }
    const response = await axios.post(
      "https://testapi.payarc.net/v1/charges",
      {
        customer_id: customerId,
        amount,
        description,
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
    return { success: true, data: response.data };
  } catch (error) {
    console.error("❌ Charge error:", error.response?.data || error.message);
    return {
      success: false,
      error: error.message,
      details: error.response?.data,
    };
  }
}

/**
 * Fetches studio payment credentials from Firestore
 */
async function getStudioPaymentCredentials(studioId) {
  try {
    if (!studioId) throw new Error("Studio ID is required");
    const studioDoc = await admin
      .firestore()
      .collection("Studios")
      .doc(studioId)
      .get();
    if (!studioDoc.exists) throw new Error("Studio not found");
    const data = studioDoc.data();
    if (!data || !data.PayArcApiKey || !data.PayArcMerchantCode) {
      throw new Error("Studio payment credentials not found");
    }
    return {
      apiKey: data.PayArcApiKey,
      merchantCode: data.PayArcMerchantCode,
    };
  } catch (error) {
    console.error("❌ Get studio payment credentials error:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Processes a registration payment (stub, add your logic here)
 */
async function processRegistrationPayment(paymentData) {
  // Add your full registration payment logic here
  return { success: false, error: "Not implemented" };
}

/**
 * Processes a one-time payment (stub, add your logic here)
 */
async function processOneTimePayment(paymentData) {
  // Add your full one-time payment logic here
  return { success: false, error: "Not implemented" };
}

/**
 * Processes an existing customer payment (stub, add your logic here)
 */
async function processExistingCustomerPayment(paymentData) {
  // Add your full existing customer payment logic here
  return { success: false, error: "Not implemented" };
}

module.exports = {
  createCardToken,
  createCustomer,
  attachPaymentMethod,
  processCharge,
  getStudioPaymentCredentials,
  processRegistrationPayment,
  processOneTimePayment,
  processExistingCustomerPayment,
  maskSensitiveData,
};
