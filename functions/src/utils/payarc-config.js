const functions = require("firebase-functions");

// Define PayArc configuration constants with fallback values
const PAYARC_CONFIG = {
  BASE_URL: "https://testdashboard.payarc.net/api/api-main",
  VERSION: "1.0",
  MERCHANT_CODE: "0567059896206807",
  AGENT_KEY: "500000",
  API_KEY: [
    "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9",
    ".eyJhdWQiOiI0NzMzIiwianRpIjoiYTI2MzliYWZhOTRhMGI4ZTk2YjZiZWMzZWUxZWQ2",
    "YmE5ZGU0OGY3ODBkZDBmNzdiNDc3ZTg2YTJkNDkxYzg3MjlkMTUyZGYyOTA2MDZkZWYi"
  ].join("")
};

exports.getPayarcConfig = () => {
  const payarcConfig = functions.config().payarc || {};
  const agentConfig = functions.config().agent || {};

  const config = {
    baseURL: payarcConfig.base_url || PAYARC_CONFIG.BASE_URL,
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "Authorization": `Bearer ${payarcConfig.key || PAYARC_CONFIG.API_KEY}`,
      "Payarc-Version": payarcConfig.version || PAYARC_CONFIG.VERSION,
      "Merchant-Code": payarcConfig.merchant_code || PAYARC_CONFIG.MERCHANT_CODE,
      "Agent-Code": agentConfig.key || PAYARC_CONFIG.AGENT_KEY,
      "User-Agent": "StudiosyncApp/1.0"
    }
  };

  // Log configuration for debugging
  console.log("🔧 PayArc Config Generated:", {
    baseURL: config.baseURL,
    merchantCode: config.headers["Merchant-Code"],
    version: config.headers["Payarc-Version"],
    agentCode: config.headers["Agent-Code"],
    hasAuth: !!config.headers.Authorization
  });

  return config;
};
