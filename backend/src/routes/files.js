import { Router } from 'express';
import {
  registerFile,
  editFile,
  getDashboardSummary,
  scanFile,
  forwardFile,
  backtrackFile,
  receiveFile,
  searchFiles,
  getOfficerInbox,
  getActivityLog,
  getFileSmsLogs,
  resolveMissingDocuments,
  reOcrDocumentVerification,
  uploadDocumentOnBehalf,
  reuploadDocument,
  reviewDocumentReviewed,
} from '../controllers/fileController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validateRegisterFile, validateForward, validateBacktrack } from '../middleware/validation.js';

const router = Router();

// Apply auth and staff access to all routes under this controller
router.use(authenticate, authorize('officer', 'admin', 'ward_chair'));

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
router.post('/:id/receive', receiveFile);
router.put('/:id/resolve-documents', resolveMissingDocuments);

// Officer-initiated correction of registration fields. Logs to immutable
// ledger as actionType 'Edited' so the audit chain stays intact.
router.put('/:id/details', editFile);

// Tier-3 #13: per-documentVerification re-OCR (officer refresh).
router.post('/:id/document-verifications/:idx/re-ocr', reOcrDocumentVerification);

// Per-document officer actions surfaced in the Resolve Attachments modal.
// Officer-only — gated inside each controller via req.user.role so we can
// return 403 with a specific message instead of a silent pass-through.
//   upload   — for `not_uploaded` (officer uploads on citizen's behalf)
//   reupload — for `needs_review` (officer replaces a flagged scan)
//   reviewed — for `needs_review` (officer manual sign-off; supports
//              forceVerified override when missingKeywords remain)
router.post('/:id/document-verifications/:idx/upload', uploadDocumentOnBehalf);
router.post('/:id/document-verifications/:idx/reupload', reuploadDocument);
router.post('/:id/document-verifications/:idx/reviewed', reviewDocumentReviewed);

// SMS audit logs endpoint
router.get('/:id/sms-logs', getFileSmsLogs);

export default router;
