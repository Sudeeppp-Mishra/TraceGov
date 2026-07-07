import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User, ROLES } from '../models/User.js';

/**
 * Register a new Officer/Admin account.
 */
export async function register(req, res, next) {
  try {
    const { name, email, password, role, wardCode, deskLocation } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const emailLower = email.toLowerCase().trim();
    const existing = await User.findOne({ email: emailLower });
    if (existing) {
      return res.status(409).json({ error: 'This email is already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      name,
      email: emailLower,
      passwordHash,
      role: role || ROLES.OFFICER,
      wardCode: wardCode || 'W01',
      deskLocation: deskLocation || 'Reception',
    });

    return res.status(201).json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      wardCode: user.wardCode,
      deskLocation: user.deskLocation,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Log in to an Officer/Admin account. Enforces correct dashboard roles.
 */
export async function login(req, res, next) {
  try {
    const { email, password, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+passwordHash');
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid email or password credentials' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'This account has been deactivated' });
    }

    // Guard role specificity (e.g. prevent officer logging in under admin route configuration)
    if (role && user.role !== role) {
      return res.status(403).json({
        error: `Authorized access mismatch: Account is registered as "${user.role}"`,
      });
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    return res.json({
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
    next(err);
  }
}

/**
 * Returns currently logged-in user profile.
 */
export function me(req, res) {
  return res.json({ user: req.user });
}

/**
 * Retrieves lists of all active officers/admins for file redirection desk targets.
 */
export async function getOfficers(req, res, next) {
  try {
    const officers = await User.find({ role: { $in: [ROLES.OFFICER, ROLES.ADMIN] }, isActive: true })
      .select('name email role wardCode deskLocation')
      .lean();
    return res.json(officers);
  } catch (err) {
    next(err);
  }
}
