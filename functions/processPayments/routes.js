const express = require("express");
const {
  processRegistrationPayment,
  processOneTimePayment,
  processExistingCustomerPayment,
  getStudioPaymentCredentials,
  createCardToken,
  createCustomer,
  attachPaymentMethod,
  processCharge,
  maskSensitiveData,
} = require("./helpers/payments");

const router = express.Router();

router.get("/test", (req, res) => {
  res
    .status(200)
    .json({
      message: "Payment API is working!",
      timestamp: new Date().toISOString(),
    });
});

router.post("/process-payment", async (req, res) => {
  try {
    const paymentData = req.body.data || req.body;
    const maskedData = maskSensitiveData(paymentData);
    const studioId = paymentData.studioId;
    if (!studioId)
      return res
        .status(400)
        .json({ success: false, error: "Studio ID is required" });

    const paymentType = paymentData.paymentType || "registration";
    let result;

    switch (paymentType) {
      case "registration":
        result = await processRegistrationPayment({
          ...paymentData,
          includedSurcharge: true,
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

router.get("/test-credentials/:studioId", async (req, res) => {
  try {
    const studioId = req.params.studioId;
    if (!studioId)
      return res
        .status(400)
        .json({ success: false, error: "Studio ID is required" });
    const credentials = await getStudioPaymentCredentials(studioId);
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

router.post("/test-charge", async (req, res) => {
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
    return res
      .status(200)
      .json({
        success: true,
        message: "Charge processed successfully",
        result: chargeResult,
      });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/payarc-info", async (req, res) => {
  const axios = require("axios");
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
    const response = await axios.get(url, { headers });
    return res
      .status(200)
      .json({
        success: true,
        message: "Successfully retrieved PayArc API information",
        data: response.data,
      });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/create-card-token", async (req, res) => {
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

router.post("/attach-payment-method", async (req, res) => {
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
    return res
      .status(200)
      .json({
        success: true,
        paymentMethodId,
        cardBrand: cardBrand || "Unknown",
        data: result.data,
      });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/create-customer", async (req, res) => {
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

module.exports = router;
