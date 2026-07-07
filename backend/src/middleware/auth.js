import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

/**
 * Enforces JWT authentication. Decodes the token, verifies identity,
 * and attaches the active User model to req.user.
 */
export async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication token required' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-passwordHash');

    if (!user) {
      return res.status(401).json({ error: 'User account not found' });
    }

    if (!user.isActive) {
      return res.status(401).json({ error: 'This user account is suspended' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Authentication token has expired' });
    }
    return res.status(401).json({ error: 'Invalid authentication token' });
  }
}

/**
 * Access guard restricting route to users holding specific system roles.
 */
export function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'User identity is unverified' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access forbidden: insufficient privilege level' });
    }

    next();
  };
}

/**
 * Optional authentication that populates req.user if a valid token is provided,
 * but otherwise allows the request to pass uninhibited (used for public tracking endpoints).
 */
export async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-passwordHash');
    
    if (user && user.isActive) {
      req.user = user;
    }
  } catch (err) {
    // Ignore validation errors for optional credentials
  }

  next();
}
