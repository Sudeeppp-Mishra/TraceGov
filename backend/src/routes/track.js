import { Router } from 'express';
import { trackFile } from '../controllers/trackController.js';

const router = Router();

// Public endpoint for citizen tracking queries
router.get('/:trackingId', trackFile);

export default router;
