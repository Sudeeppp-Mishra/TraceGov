import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { User, ROLES } from '../models/User.js';
import { MovementHistory } from '../models/MovementHistory.js';

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

    // Auto-promote ward chair accounts if registered prior to role creation
    if (user.email.includes('wardchair') || (user.deskLocation && user.deskLocation.toLowerCase().includes('ward chair'))) {
      if (user.role !== ROLES.WARD_CHAIR) {
        user.role = ROLES.WARD_CHAIR;
        await user.save();
      }
    }

    // Guard role specificity (e.g. prevent officer logging in under admin route configuration)
    if (role) {
      if (role === 'admin' && user.role !== ROLES.ADMIN) {
        return res.status(403).json({
          error: `Authorized access mismatch: Account is registered as "${user.role}"`,
        });
      }
      if (role === 'officer' && ![ROLES.OFFICER, ROLES.WARD_CHAIR].includes(user.role)) {
        return res.status(403).json({
          error: `Authorized access mismatch: Account is registered as "${user.role}"`,
        });
      }
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
    const officers = await User.find({ role: { $in: [ROLES.OFFICER, ROLES.ADMIN, ROLES.WARD_CHAIR] }, isActive: true })
      .select('name email role wardCode deskLocation')
      .lean();
    return res.json(officers);
  } catch (err) {
    next(err);
  }
}

/**
 * Remove an officer account (Admin only).
 * Officers referenced by the immutable movement ledger are deactivated instead
 * of hard-deleted so audit history keeps resolving their names; accounts with
 * no ledger entries are removed outright. Either way they leave the roster and
 * can no longer sign in.
 */
export async function deleteOfficer(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.warn(`[DELETE OFFICER] Invalid ObjectId received: "${id}" from admin ${req.user._id} (ward ${req.user.wardCode})`);
      return res.status(404).json({ success: false, error: 'Officer not found' });
    }

    if (String(req.user._id) === String(id)) {
      return res.status(400).json({ success: false, error: 'You cannot remove your own account.' });
    }

    // Match getOfficers behavior: cross-ward visibility for admins, no wardCode filter.
    const officer = await User.findOne({ _id: id });
    if (!officer) {
      console.warn(`[DELETE OFFICER] No officer matches id "${id}" — admin ${req.user._id} (ward ${req.user.wardCode}) tried to remove someone who no longer exists`);
      return res.status(404).json({ success: false, error: 'Officer not found' });
    }
    if (officer.role === ROLES.ADMIN) {
      return res.status(400).json({ success: false, error: 'Administrator accounts cannot be removed here.' });
    }

    const ledgerEntries = await MovementHistory.countDocuments({ officerId: officer._id });
    if (ledgerEntries > 0) {
      officer.isActive = false;
      await officer.save();
    } else {
      await User.deleteOne({ _id: officer._id });
    }

    return res.json({ success: true, message: 'Officer removed' });
  } catch (err) {
    next(err);
  }
}

/**
 * Update an officer account details (Admin only).
 */
export async function updateOfficer(req, res, next) {
  try {
    const { id } = req.params;
    const { name, email, deskLocation } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.warn(`[UPDATE OFFICER] Invalid ObjectId received: "${id}" from admin ${req.user._id} (ward ${req.user.wardCode})`);
      return res.status(404).json({ success: false, error: 'Officer not found' });
    }

    // Match getOfficers behavior: cross-ward visibility for admins, no wardCode filter.
    const officer = await User.findOne({ _id: id });
    if (!officer) {
      console.warn(`[UPDATE OFFICER] No officer matches id "${id}" — admin ${req.user._id} (ward ${req.user.wardCode}) tried to update someone who no longer exists`);
      return res.status(404).json({ success: false, error: 'Officer not found' });
    }
    if (officer.role === ROLES.ADMIN) {
      return res.status(400).json({ success: false, error: 'Administrator accounts cannot be modified here.' });
    }

    if (name && name.trim()) officer.name = name.trim();
    if (email && email.trim()) {
      const emailLower = email.toLowerCase().trim();
      const existing = await User.findOne({ email: emailLower, _id: { $ne: id } });
      if (existing) {
        return res.status(409).json({ error: 'This email is already in use by another user' });
      }
      officer.email = emailLower;
    }
    if (deskLocation) officer.deskLocation = deskLocation;

    await officer.save();
    return res.json({
      success: true,
      officer: {
        id: officer._id,
        name: officer.name,
        email: officer.email,
        role: officer.role,
        wardCode: officer.wardCode,
        deskLocation: officer.deskLocation,
      },
    });
  } catch (err) {
    next(err);
  }
}

