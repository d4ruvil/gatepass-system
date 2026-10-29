const express = require("express");
const PassRequest = require("../models/PassRequest");
const { getReadContract } = require("../blockchain/contract");

const router = express.Router();

const EFFECTIVE_STATUS_NAMES = [
  "Pending",
  "CoordinatorApproved",
  "LabApproved",
  "Approved",
  "Rejected",
  "Revoked",
  "Expired",
];

function nowMinutesOfDay() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/// Maps the chain's effective status + time-of-day window to one of the four
/// banners the guard's scanner screen shows: VALID / EXPIRED / REVOKED / INVALID.
function toDisplayStatus(effectiveStatusName, pass) {
  if (effectiveStatusName === "Revoked") return { displayStatus: "REVOKED", reason: "This pass was revoked." };
  if (effectiveStatusName === "Expired") return { displayStatus: "EXPIRED", reason: "This pass's validity window has ended." };
  if (effectiveStatusName === "Approved") {
    const minutesNow = nowMinutesOfDay();
    if (minutesNow < pass.timeFromMinutes || minutesNow > pass.timeToMinutes) {
      return { displayStatus: "INVALID", reason: "Outside the permitted hours for this pass today." };
    }
    return { displayStatus: "VALID", reason: null };
  }
  if (effectiveStatusName === "Rejected") return { displayStatus: "INVALID", reason: "This request was rejected." };
  return { displayStatus: "INVALID", reason: "This pass has not completed approval yet." };
}

// Guard scans the QR (which encodes just the on-chain pass id) and hits this.
// Always reads live from the chain — never trusts the cached DB status alone.
router.get("/:passId", async (req, res) => {
  const onChainId = Number(req.params.passId);
  if (!Number.isInteger(onChainId) || onChainId <= 0) return res.status(400).json({ error: "Invalid pass id" });

  let effectiveStatusIdx, pass;
  try {
    const contract = getReadContract();
    const result = await contract.verifyPass(onChainId);
    effectiveStatusIdx = Number(result[0]);
    pass = result[1];
  } catch {
    return res.status(404).json({ displayStatus: "INVALID", reason: "Pass does not exist on-chain." });
  }

  const effectiveStatusName = EFFECTIVE_STATUS_NAMES[effectiveStatusIdx];
  const record = await PassRequest.findOne({ onChainId }).populate("student", "name");

  const timeFromMinutes = Number(pass.timeFromMinutes);
  const timeToMinutes = Number(pass.timeToMinutes);

  const { displayStatus, reason } = toDisplayStatus(effectiveStatusName, { timeFromMinutes, timeToMinutes });

  res.json({
    passId: onChainId,
    displayStatus,
    reason,
    onChainStatus: effectiveStatusName,
    studentName: record?.studentName,
    purpose: record?.purpose,
    validFrom: pass.validFrom ? new Date(Number(pass.validFrom) * 1000) : null,
    validTo: pass.validTo ? new Date(Number(pass.validTo) * 1000) : null,
    timeFromMinutes,
    timeToMinutes,
  });
});

module.exports = router;
