import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, wardCode, deskLocation } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      name,
      email,
      passwordHash,
      role: role || 'officer',
      wardCode: wardCode || 'W01',
      deskLocation: deskLocation || 'Reception',
    });

    res.status(201).json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      wardCode: user.wardCode,
      deskLocation: user.deskLocation,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: email?.toLowerCase() }).select('+passwordHash');
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        wardCode: user.wardCode,
        deskLocation: user.deskLocation,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

router.get('/officers', authenticate, authorize('admin', 'officer'), async (_req, res) => {
  const officers = await User.find({ role: { $in: ['officer', 'admin'] }, isActive: true })
    .select('name email wardCode deskLocation role')
    .lean();
  res.json(officers);
});

export default router;
