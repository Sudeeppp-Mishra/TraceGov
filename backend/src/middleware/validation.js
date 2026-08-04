import { FILE_STATUSES } from '../models/File.js';
import { ROLES } from '../models/User.js';
import { Department } from '../models/Department.js';

let cachedDesks = [];
let cacheTime = 0;

/**
 * Helper to fetch active departments and cache them for 30 seconds.
 */
async function getValidDesks(wardCode = 'W01') {
  const now = Date.now();
  if (cachedDesks.length > 0 && now - cacheTime < 30000) {
    return cachedDesks;
  }
  try {
    const depts = await Department.find({ wardCode, isActive: true }).select('name').lean();
    cachedDesks = depts.map((d) => d.name);
    // Ensure default system locations are always permitted if not explicitly seeded
    if (cachedDesks.length === 0) {
      cachedDesks = [
        'Reception',
        'Verification Desk',
        'Ward Chair Section',
        'Tax Office Desk',
        'Administrative Archives',
        'Review Panel Office',
      ];
    }
    if (!cachedDesks.includes('Admin Office')) {
      cachedDesks.push('Admin Office');
    }
    cacheTime = now;
    return cachedDesks;
  } catch (err) {
    return [
      'Reception',
      'Verification Desk',
      'Ward Chair Section',
      'Tax Office Desk',
      'Administrative Archives',
      'Review Panel Office',
      'Admin Office',
    ];
  }
}

/**
 * Validates the auth registration payload.
 */
export async function validateRegister(req, res, next) {
  try {
    const { name, email, password, role, wardCode, deskLocation } = req.body;

    const errors = [];

    if (!name || typeof name !== 'string' || !name.trim()) {
      errors.push({ field: 'name', message: 'Name is required and must be a string' });
    } else if (name.length > 100) {
      errors.push({ field: 'name', message: 'Name cannot exceed 100 characters' });
    }

    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!email || typeof email !== 'string' || !email.trim()) {
      errors.push({ field: 'email', message: 'Email is required' });
    } else if (!emailRegex.test(email.trim())) {
      errors.push({ field: 'email', message: 'Please provide a valid email address' });
    }

    if (!password || typeof password !== 'string') {
      errors.push({ field: 'password', message: 'Password is required' });
    } else if (password.length < 6) {
      errors.push({ field: 'password', message: 'Password must be at least 6 characters' });
    }

    if (role && !Object.values(ROLES).includes(role)) {
      errors.push({ field: 'role', message: `Role must be one of: ${Object.values(ROLES).join(', ')}` });
    }

    if (wardCode && (typeof wardCode !== 'string' || !wardCode.trim())) {
      errors.push({ field: 'wardCode', message: 'Ward code must be a non-empty string' });
    }

    if (deskLocation) {
      const validDesks = await getValidDesks(wardCode || 'W01');
      if (!validDesks.includes(deskLocation)) {
        errors.push({ field: 'deskLocation', message: 'Invalid desk location assignment' });
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors,
      });
    }

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Validates the auth login payload.
 */
export function validateLogin(req, res, next) {
  const { email, password } = req.body;
  const errors = [];

  const emailRegex = /^\S+@\S+\.\S+$/;
  if (!email || typeof email !== 'string' || !email.trim()) {
    errors.push({ field: 'email', message: 'Email is required' });
  } else if (!emailRegex.test(email.trim())) {
    errors.push({ field: 'email', message: 'Please provide a valid email address' });
  }

  if (!password || typeof password !== 'string') {
    errors.push({ field: 'password', message: 'Password is required' });
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors,
    });
  }

  next();
}

/**
 * Validates physical file registration.
 */
export function validateRegisterFile(req, res, next) {
  const { title, citizenName, citizenPhone, citizenEmail, documentType, requiredDocuments } = req.body;
  const errors = [];

  if (!title || typeof title !== 'string' || !title.trim()) {
    errors.push({ field: 'title', message: 'File title is required' });
  } else if (title.length > 200) {
    errors.push({ field: 'title', message: 'File title cannot exceed 200 characters' });
  }

  if (!citizenName || typeof citizenName !== 'string' || !citizenName.trim()) {
    errors.push({ field: 'citizenName', message: 'Citizen name is required' });
  }

  if (!citizenPhone || typeof citizenPhone !== 'string' || !citizenPhone.trim()) {
    errors.push({ field: 'citizenPhone', message: 'Citizen phone number is required' });
  } else if (!/^\d{10}$/.test(citizenPhone.trim())) {
    errors.push({ field: 'citizenPhone', message: 'Citizen phone number must be exactly 10 digits' });
  }

  if (citizenEmail && typeof citizenEmail === 'string' && citizenEmail.trim()) {
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(citizenEmail.trim())) {
      errors.push({ field: 'citizenEmail', message: 'Please provide a valid email address' });
    }
  }

  if (!documentType || typeof documentType !== 'string' || !documentType.trim()) {
    errors.push({ field: 'documentType', message: 'Document category is required' });
  }

  if (requiredDocuments && !Array.isArray(requiredDocuments)) {
    errors.push({ field: 'requiredDocuments', message: 'Required documents checklist must be an array' });
  }

  if (req.body.documentVerifications && !Array.isArray(req.body.documentVerifications)) {
    errors.push({ field: 'documentVerifications', message: 'Document verifications must be an array' });
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors,
    });
  }

  next();
}

/**
 * Validates forwarding a file.
 */
export async function validateForward(req, res, next) {
  try {
    const { nextLocation, nextStatus } = req.body;
    const errors = [];
    const wardCode = req.user?.wardCode || 'W01';

    const isFinalStatus = ['Approved', 'Dispatched', 'Rejected'].includes(nextStatus);

    if (!isFinalStatus) {
      if (!nextLocation || typeof nextLocation !== 'string' || !nextLocation.trim()) {
        errors.push({ field: 'nextLocation', message: 'Target desk location is required' });
      } else {
        const validDesks = await getValidDesks(wardCode);
        if (!validDesks.includes(nextLocation)) {
          errors.push({ field: 'nextLocation', message: 'Invalid target desk location' });
        }
      }
    }

    if (nextStatus && !Object.values(FILE_STATUSES).includes(nextStatus)) {
      errors.push({ field: 'nextStatus', message: `Invalid status: must be one of ${Object.values(FILE_STATUSES).join(', ')}` });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors,
      });
    }

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Validates backtracking a file.
 */
export async function validateBacktrack(req, res, next) {
  try {
    const { returnLocation, backtrackReason } = req.body;
    const errors = [];
    const wardCode = req.user?.wardCode || 'W01';

    if (!returnLocation || typeof returnLocation !== 'string' || !returnLocation.trim()) {
      errors.push({ field: 'returnLocation', message: 'Return location/desk is required' });
    } else {
      const validDesks = await getValidDesks(wardCode);
      if (!validDesks.includes(returnLocation)) {
        errors.push({ field: 'returnLocation', message: 'Invalid return desk location' });
      }
    }

    if (!backtrackReason || typeof backtrackReason !== 'string' || !backtrackReason.trim()) {
      errors.push({ field: 'backtrackReason', message: 'Backtrack reason is required' });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors,
      });
    }

    next();
  } catch (err) {
    next(err);
  }
}
