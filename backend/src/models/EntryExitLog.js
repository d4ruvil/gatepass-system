const mongoose = require("mongoose");

const entryExitLogSchema = new mongoose.Schema(
  {
    pass: { type: mongoose.Schema.Types.ObjectId, ref: "PassRequest", required: true, index: true },
    guard: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["entry", "exit"], required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("EntryExitLog", entryExitLogSchema);
