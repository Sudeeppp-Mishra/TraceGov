import { Router } from 'express';
import {
  registerFile,
  getDashboardSummary,
  scanFile,
  forwardFile,
  backtrackFile,
  searchFiles,
} from '../controllers/fileController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// Apply auth and staff access to all routes under this controller
router.use(authenticate, authorize('officer', 'admin'));

// Registration and search endpoints
router.post('/register', registerFile);
router.get('/search', searchFiles);

// Summary & QR scan lookup endpoints
router.get('/dashboard/summary', getDashboardSummary);
router.get('/scan/:identifier', scanFile);

// File routing action endpoints
router.post('/:id/forward', forwardFile);
router.post('/:id/backtrack', backtrackFile);

export default router;
