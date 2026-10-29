const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const passesRoutes = require("./routes/passes");
const verifyRoutes = require("./routes/verify");
const logsRoutes = require("./routes/logs");
const adminRoutes = require("./routes/admin");

const app = express();

app.use(cors());
app.use(express.json({ limit: "5mb" })); // signature images can be small base64 blobs

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/passes", passesRoutes);
app.use("/api/verify", verifyRoutes);
app.use("/api/logs", logsRoutes);
app.use("/api/admin", adminRoutes);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

module.exports = app;
