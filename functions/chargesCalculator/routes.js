const express = require("express");
const router = express.Router();
const { calculateFamilyCharges } = require("./helpers/tuition");

// Health check
router.get("/", (req, res) => {
  res.status(200).json({
    message: "Charges Calculator API is working!",
    timestamp: new Date().toISOString(),
  });
});

// Main calculation endpoint
router.post("/calculateFamilyCharges", async (req, res) => {
  const logs = [];
  const logAndCapture = (message, data = null) => {
    const logEntry = data ? `${message}: ${JSON.stringify(data)}` : message;
    console.log(logEntry);
    logs.push(logEntry);
  };

  try {
    const { familyData, studioId } = req.body;
    if (!familyData || !studioId) {
      logAndCapture("Missing required parameters");
      return res.status(400).json({
        success: false,
        error: "Missing required parameters: familyData and studioId",
        logs,
      });
    }

    const result = await calculateFamilyCharges(
      familyData,
      studioId,
      logAndCapture
    );
    result.logs = logs;
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    logAndCapture("Sending response to client");
    return res.json(result);
  } catch (error) {
    logAndCapture(
      `Error in calculateFamilyCharges API: ${error.message}`,
      error.stack
    );
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    return res.status(500).json({
      success: false,
      error: error.message || "An unexpected error occurred",
      logs,
    });
  }
});

module.exports = router;
