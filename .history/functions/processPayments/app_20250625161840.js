const express = require("express");
const cors = require("cors");
const routes = require("./routes");

const app = express();

app.use(cors({ origin: true, methods: ["GET", "POST", "OPTIONS"] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging and CORS middleware
app.use((req, res, next) => {
  console.log(
    `[${new Date().toISOString()}] ${req.method} ${req.path} - Origin: ${
      req.headers.origin || "unknown"
    }`
  );
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Accept"
  );
  if (req.method === "OPTIONS") return res.status(204).send("");
  next();
});

app.use("/", routes);

module.exports = app;
