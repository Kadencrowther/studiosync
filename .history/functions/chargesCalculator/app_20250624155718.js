const express = require("express");
const cors = require("cors");
const routes = require("./routes");

const app = express();

app.use(
  cors({
    origin: [
      "https://studiosync-af73d.web.app",
      "https://studiosync-af73d.firebaseapp.com",
      "https://studiosyncdance.com",
      "http://localhost:5000",
    ],
    methods: ["POST", "OPTIONS", "GET"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  console.log(
    `[${new Date().toISOString()}] ${req.method} ${req.path} - Origin: ${
      req.headers.origin || "unknown"
    }`
  );
  next();
});

// Attach routes
app.use("/", routes);

module.exports = app;
