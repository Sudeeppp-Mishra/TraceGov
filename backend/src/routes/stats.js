import { Router } from 'express';
import {
  getPublicStats,
  getWeeklyThroughput,
  getAdminInfraMetrics,
  getAdminAnalytics,
} from '../controllers/statsController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// Public, unauthenticated: platform-wide counts for the landing page trust bar.
router.get('/public', getPublicStats);

// Authenticated: movements per day over the last 7 days (real data for analytics charts).
router.get('/weekly', authenticate, authorize('officer', 'admin'), getWeeklyThroughput);

// Admin-only: live infra metrics (CPU / RAM / DB / API throughput) powering the
// "System Resource Metrics" tiles. Replaces the previously hardcoded values.
router.get('/admin/infra-metrics', authenticate, authorize('admin'), getAdminInfraMetrics);

// Admin-only: aggregated analytics for the dashboard's new visuals (files per
// desk, avg time-in-desk, officer workload, daily registrations, review
// turnaround, blocked-files breakdown).
router.get('/admin/analytics', authenticate, authorize('admin'), getAdminAnalytics);

export default router;
