const mongoose = require("mongoose");

const ROLES = ["student", "coordinator", "lab_incharge", "dean", "guard", "admin"];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, required: true },
    phone: { type: String },
    // Required for coordinator/lab_incharge/dean — the wallet whose signature counts on-chain.
    walletAddress: { type: String, lowercase: true },
    // Only relevant for role "student".
    enrollmentNo: { type: String },
    programme: { type: String },
    discipline: { type: String },
    semester: { type: String },
    parentMobile: { type: String },
  },
  { timestamps: true }
);

userSchema.methods.toSafeJSON = function toSafeJSON() {
  const { passwordHash, __v, ...rest } = this.toObject();
  return { ...rest, id: this._id.toString() };
};

module.exports = mongoose.model("User", userSchema);
module.exports.ROLES = ROLES;
