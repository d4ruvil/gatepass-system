const mongoose = require("mongoose");

const STATUSES = [
  "pending",
  "coordinator_approved",
  "lab_approved",
  "approved",
  "rejected",
  "revoked",
  "expired",
];

const passRequestSchema = new mongoose.Schema(
  {
    onChainId: { type: Number, index: true }, // set once the backend relayer's submitPass tx confirms
    student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // Paper-form fields — off-chain only, never sent on-chain in plaintext.
    studentName: { type: String, required: true },
    enrollmentNo: { type: String, required: true },
    programme: { type: String, required: true },
    discipline: { type: String, required: true },
    semester: { type: String, required: true },
    studentMobile: { type: String, required: true },
    parentMobile: { type: String, required: true },
    purpose: { type: String, required: true },
    declarationAccepted: { type: Boolean, required: true },
    declarationAcceptedAt: { type: Date, required: true },
    signatureData: { type: String }, // typed name or base64 image, kept small

    // Mirrors the on-chain validity window (source of truth is still the chain).
    validFrom: { type: Date, required: true },
    validTo: { type: Date, required: true },
    timeFromMinutes: { type: Number, required: true },
    timeToMinutes: { type: Number, required: true },

    dataHash: { type: String, required: true }, // 0x-prefixed bytes32, matches on-chain Pass.dataHash
    cachedStatus: { type: String, enum: STATUSES, default: "pending" },
    rejectReason: { type: String },
    submitTxHash: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PassRequest", passRequestSchema);
module.exports.STATUSES = STATUSES;
