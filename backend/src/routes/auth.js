import { Router } from 'express';
import { register, login, me, getOfficers } from '../controllers/authController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// Public registration & login endpoints
router.post('/register', register);
router.post('/login', login);

// Secured user profile session endpoint
router.get('/me', authenticate, me);

// Secured roster retrieval (available to officers and admins)
router.get('/officers', authenticate, authorize('officer', 'admin'), getOfficers);

export default router;
