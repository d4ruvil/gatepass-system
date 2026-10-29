const express = require("express");
const PassRequest = require("../models/PassRequest");
const EntryExitLog = require("../models/EntryExitLog");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

async function logMovement(req, res, type) {
  const onChainId = Number(req.body.passId);
  const pass = await PassRequest.findOne({ onChainId });
  if (!pass) return res.status(404).json({ error: "Pass not found" });

  const log = await EntryExitLog.create({ pass: pass._id, guard: req.user.id, type });
  res.status(201).json({ log });
}

router.post("/entry", requireAuth, requireRole("guard", "admin"), (req, res) => logMovement(req, res, "entry"));
router.post("/exit", requireAuth, requireRole("guard", "admin"), (req, res) => logMovement(req, res, "exit"));

// Recent scans list for the guard's dashboard.
router.get("/", requireAuth, requireRole("guard", "admin"), async (req, res) => {
  const logs = await EntryExitLog.find()
    .populate("guard", "name")
    .populate({ path: "pass", select: "studentName onChainId purpose" })
    .sort({ timestamp: -1 })
    .limit(20);
  res.json({ logs });
});

router.get("/:passId", requireAuth, async (req, res) => {
  const onChainId = Number(req.params.passId);
  const pass = await PassRequest.findOne({ onChainId });
  if (!pass) return res.status(404).json({ error: "Pass not found" });

  const logs = await EntryExitLog.find({ pass: pass._id }).populate("guard", "name").sort({ timestamp: -1 });
  res.json({ logs });
});

module.exports = router;
