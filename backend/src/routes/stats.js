import { Router } from 'express';
import { getPublicStats, getWeeklyThroughput } from '../controllers/statsController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// Public, unauthenticated: platform-wide counts for the landing page trust bar.
router.get('/public', getPublicStats);

// Authenticated: movements per day over the last 7 days (real data for analytics charts).
router.get('/weekly', authenticate, authorize('officer', 'admin'), getWeeklyThroughput);

export default router;