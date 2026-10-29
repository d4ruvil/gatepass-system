const PassRequest = require("../models/PassRequest");
const { getReadContract } = require("./contract");

/// Keeps MongoDB's cachedStatus in sync with on-chain events so dashboards
/// load fast without hitting the chain on every request. The chain itself
/// remains the source of truth — verify/:passId always re-checks it live.
function startEventSync() {
  const contract = getReadContract();

  contract.on("PassApprovedByCoordinator", async (passId) => {
    await updateStatus(passId, "coordinator_approved");
  });

  contract.on("PassApprovedByLabIncharge", async (passId) => {
    await updateStatus(passId, "lab_approved");
  });

  contract.on("PassApprovedByDean", async (passId) => {
    await updateStatus(passId, "approved");
  });

  contract.on("PassRejected", async (passId, rejectedBy, reason) => {
    await updateStatus(passId, "rejected", { rejectReason: reason });
  });

  contract.on("PassRevoked", async (passId) => {
    await updateStatus(passId, "revoked");
  });

  console.log("Blockchain event listeners attached for status sync");
}

async function updateStatus(passId, cachedStatus, extra = {}) {
  const onChainId = Number(passId);
  try {
    await PassRequest.findOneAndUpdate({ onChainId }, { cachedStatus, ...extra });
    console.log(`Synced pass #${onChainId} -> ${cachedStatus}`);
  } catch (err) {
    console.error(`Failed to sync pass #${onChainId}:`, err.message);
  }
}

module.exports = { startEventSync };
