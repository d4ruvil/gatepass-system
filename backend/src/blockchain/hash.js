const { ethers } = require("ethers");

/// Canonical format for the on-chain tamper-detection hash. Anyone with the
/// off-chain record (name, enrollment, dates) can recompute this and compare
/// it against Pass.dataHash on-chain to prove the record hasn't been altered.
/// Never includes phone numbers or purpose — keep the hash input minimal and documented.
function computeDataHash({ studentName, enrollmentNo, validFromUnix, validToUnix }) {
  const raw = `${studentName}|${enrollmentNo}|${validFromUnix}|${validToUnix}`;
  return ethers.keccak256(ethers.toUtf8Bytes(raw));
}

module.exports = { computeDataHash };
