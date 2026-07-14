import { Router } from 'express';
import { register, login, me, getOfficers } from '../controllers/authController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validateRegister, validateLogin } from '../middleware/validation.js';

const router = Router();

// Public registration & login endpoints
router.post('/register', validateRegister, register);
router.post('/login', validateLogin, login);

// Secured user profile session endpoint
router.get('/me', authenticate, me);

// Secured roster retrieval (available to officers and admins)
router.get('/officers', authenticate, authorize('officer', 'admin'), getOfficers);

export default router;
