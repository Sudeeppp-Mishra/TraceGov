import { Router } from 'express';
import { getPublicStats } from '../controllers/statsController.js';

const router = Router();

// Public, unauthenticated: platform-wide counts for the landing page trust bar.
router.get('/public', getPublicStats);

export default router;