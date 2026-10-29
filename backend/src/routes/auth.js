const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const User = require("../models/User");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

function signToken(user) {
  return jwt.sign({ id: user._id.toString(), role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

const studentRegisterSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  phone: z.string().min(5),
  enrollmentNo: z.string().min(1),
  programme: z.string().min(1),
  discipline: z.string().min(1),
  semester: z.string().min(1),
  parentMobile: z.string().min(5),
});

// Students self-register. Approvers/guards/admins are created by an admin (below).
router.post("/register-student", async (req, res) => {
  const parsed = studentRegisterSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { password, email, ...rest } = parsed.data;
  const existing = await User.findOne({ email });
  if (existing) return res.status(409).json({ error: "An account with this email already exists" });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ ...rest, email, passwordHash, role: "student" });

  res.status(201).json({ user: user.toSafeJSON(), token: signToken(user) });
});

const adminRegisterSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["coordinator", "lab_incharge", "dean", "guard", "admin"]),
  phone: z.string().optional(),
  walletAddress: z.string().optional(),
});

router.post("/register", requireAuth, requireRole("admin"), async (req, res) => {
  const parsed = adminRegisterSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { password, ...rest } = parsed.data;
  if (["coordinator", "lab_incharge", "dean"].includes(rest.role) && !rest.walletAddress) {
    return res.status(400).json({ error: "walletAddress is required for approver roles" });
  }

  const existing = await User.findOne({ email: rest.email });
  if (existing) return res.status(409).json({ error: "An account with this email already exists" });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ ...rest, passwordHash });

  res.status(201).json({ user: user.toSafeJSON() });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "email and password are required" });

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) return res.status(401).json({ error: "Invalid email or password" });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Invalid email or password" });

  res.json({ user: user.toSafeJSON(), token: signToken(user) });
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user: user.toSafeJSON() });
});

module.exports = router;
