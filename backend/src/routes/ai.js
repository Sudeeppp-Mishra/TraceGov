import { Router } from 'express';
import {
  aiAnalyzeDocument,
  aiEstimateCompletion,
  aiPredictDelay,
  aiSmartBacktrack,
  aiCitizenMessage,
} from '../services/aiService.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { File } from '../models/File.js';
import { MovementHistory } from '../models/MovementHistory.js';

const router = Router();

/**
 * Publicly accessible completion estimator (used by the Citizen Portal).
 */
router.post('/estimate-completion', async (req, res, next) => {
  try {
    const { fileId, trackingId } = req.body;
    let movementData = req.body.movementData;

    // Fetch movements from DB if not supplied by user client
    if (!movementData && (fileId || trackingId)) {
      const fileQuery = fileId ? { _id: fileId } : { trackingId: trackingId.toUpperCase().trim() };
      const file = await File.findOne(fileQuery).lean();
      
      if (!file) {
        return res.status(404).json({ error: 'File reference not found' });
      }

      const history = await MovementHistory.find({ fileId: file._id })
        .sort({ timestamp: 1 })
        .select('actionType timestamp currentLocation')
        .lean();

      movementData = history.map((item) => ({
        action: item.actionType,
        timestamp: item.timestamp,
        location: item.currentLocation,
      }));
    }

    const estimation = await aiEstimateCompletion({
      movementData: movementData || [],
      avgServiceRateMu: req.body.avgServiceRateMu,
      avgArrivalRateLambda: req.body.avgArrivalRateLambda,
      remainingSteps: req.body.remainingSteps || 2,
    });

    return res.json(estimation);
  } catch (err) {
    next(err);
  }
});

/**
 * Publicly accessible status messages (used by the Citizen Portal).
 */
router.post('/citizen-message', async (req, res, next) => {
  try {
    const result = await aiCitizenMessage(req.body);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

// Apply Staff-only authentication checks to all endpoints below
router.use(authenticate, authorize('officer', 'admin', 'ward_chair'));

/**
 * Proxy OCR checking.
 */
router.post('/analyze-document', async (req, res, next) => {
  try {
    const result = await aiAnalyzeDocument(req.body);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * Predict file delays.
 */
router.post('/predict-delay', async (req, res, next) => {
  try {
    const result = await aiPredictDelay(req.body);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * Suggest backtrack destinations.
 */
router.post('/smart-backtrack', async (req, res, next) => {
  try {
    const result = await aiSmartBacktrack(req.body);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * Aggregates bottlenecks by analyzing movement logs and calculating dwell times.
 */
router.get('/bottlenecks', async (req, res, next) => {
  try {
    const wardCode = req.query.wardCode || req.user.wardCode;

    // Aggregation query: lookup corresponding file context to verify wardCode ownership
    const bottlenecks = await MovementHistory.aggregate([
      {
        $lookup: {
          from: 'files',
          localField: 'fileId',
          foreignField: '_id',
          as: 'fileContext',
        },
      },
      { $unwind: '$fileContext' },
      { $match: { 'fileContext.wardCode': wardCode } },
      {
        $group: {
          _id: '$currentLocation',
          avgDwellMinutes: {
            $avg: {
              $divide: [{ $subtract: ['$timestamp', '$fileContext.createdAt'] }, 60000],
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { avgDwellMinutes: -1 } },
      { $limit: 10 },
    ]);

    return res.json({
      wardCode,
      bottlenecks: bottlenecks.map((b) => ({
        location: b._id,
        avgDwellMinutes: Math.round(b.avgDwellMinutes),
        count: b.count,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
