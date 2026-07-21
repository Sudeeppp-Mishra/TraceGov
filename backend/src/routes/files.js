import { Router } from 'express';
import {
  registerFile,
  getDashboardSummary,
  scanFile,
  forwardFile,
  backtrackFile,
  searchFiles,
  getOfficerInbox,
  getActivityLog,
} from '../controllers/fileController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validateRegisterFile, validateForward, validateBacktrack } from '../middleware/validation.js';

const router = Router();

// Apply auth and staff access to all routes under this controller
router.use(authenticate, authorize('officer', 'admin'));

// Inbox, registration and search endpoints
router.get('/inbox', getOfficerInbox);
router.post('/register', validateRegisterFile, registerFile);
router.get('/search', searchFiles);

// Movement-ledger activity feed (officers: own actions; admins: whole ward)
router.get('/activity', getActivityLog);

// Summary & QR scan lookup endpoints
router.get('/dashboard/summary', getDashboardSummary);
router.get('/scan/:identifier', scanFile);

// File routing action endpoints
router.post('/:id/forward', validateForward, forwardFile);
router.post('/:id/backtrack', validateBacktrack, backtrackFile);

export default router;
