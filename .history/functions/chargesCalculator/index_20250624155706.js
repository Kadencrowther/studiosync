const { onRequest } = require("firebase-functions/v2/https");
const app = require("./app");

exports.chargesCalculator = onRequest(
  {
    region: "us-central1",
    memory: "512MiB",
    minInstances: 0,
    maxInstances: 10,
    timeoutSeconds: 60,
    invoker: "public",
  },
  app
);
