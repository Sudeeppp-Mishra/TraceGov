import { Router } from 'express';
import { register, login, me, getOfficers } from '../controllers/authController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validateRegister, validateLogin } from '../middleware/validation.js';

const router = Router();

// Public login endpoint only. Account creation is an admin-only, authenticated
// action (see below) to prevent unauthenticated clients from self-provisioning
// officer/admin accounts.
router.post('/login', validateLogin, login);

// Secured user profile session endpoint
router.get('/me', authenticate, me);

// Secured roster retrieval (available to officers and admins)
router.get('/officers', authenticate, authorize('officer', 'admin'), getOfficers);

// Secured account provisioning: only an authenticated admin may create new
// officer/admin accounts (e.g. via the Admin Dashboard "add officer" flow).
router.post('/register', authenticate, authorize('admin'), validateRegister, register);

export default router;