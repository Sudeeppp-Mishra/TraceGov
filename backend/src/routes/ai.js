import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { MovementHistory } from '../models/MovementHistory.js';

const router = Router();
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

async function proxyToAi(path, body, res) {
  const response = await fetch(`${AI_SERVICE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  res.status(response.status).json(data);
}

/** Proxy document OCR analysis to AI microservice */
router.post('/analyze-document', authenticate, authorize('officer', 'admin'), async (req, res) => {
  try {
    await proxyToAi('/analyze-document', req.body, res);
  } catch (err) {
    res.status(502).json({ error: `AI service unavailable: ${err.message}` });
  }
});

/** Proxy completion time estimate — available for citizen portal */
router.post('/estimate-completion', async (req, res) => {
  try {
    const { fileId, trackingId } = req.body;

    let movementData = req.body.movementData;

    if (!movementData && (fileId || trackingId)) {
      const { File } = await import('../models/File.js');
      const query = fileId ? { _id: fileId } : { trackingId: trackingId.toUpperCase() };
      const file = await File.findOne(query).lean();
      if (!file) return res.status(404).json({ error: 'File not found' });

      const history = await MovementHistory.find({ fileId: file._id })
        .sort({ timestamp: 1 })
        .select('actionType timestamp currentLocation')
        .lean();

      movementData = history.map((h) => ({
        action: h.actionType,
        timestamp: h.timestamp,
        location: h.currentLocation,
      }));
    }

    await proxyToAi('/estimate-completion', { ...req.body, movementData }, res);
  } catch (err) {
    res.status(502).json({ error: `AI service unavailable: ${err.message}` });
  }
});

router.post('/predict-delay', authenticate, authorize('officer', 'admin'), async (req, res) => {
  try {
    await proxyToAi('/predict-delay', req.body, res);
  } catch (err) {
    res.status(502).json({ error: `AI service unavailable: ${err.message}` });
  }
});

router.post('/smart-backtrack', authenticate, authorize('officer', 'admin'), async (req, res) => {
  try {
    await proxyToAi('/smart-backtrack', req.body, res);
  } catch (err) {
    res.status(502).json({ error: `AI service unavailable: ${err.message}` });
  }
});

router.post('/citizen-message', async (req, res) => {
  try {
    await proxyToAi('/citizen-message', req.body, res);
  } catch (err) {
    res.status(502).json({ error: `AI service unavailable: ${err.message}` });
  }
});

/** Aggregate bottleneck stats from movement logs */
router.get('/bottlenecks', authenticate, authorize('admin', 'officer'), async (req, res) => {
  try {
    const wardCode = req.query.wardCode || req.user.wardCode;

    const pipeline = [
      {
        $lookup: {
          from: 'files',
          localField: 'fileId',
          foreignField: '_id',
          as: 'file',
        },
      },
      { $unwind: '$file' },
      { $match: { 'file.wardCode': wardCode } },
      {
        $group: {
          _id: '$currentLocation',
          avgDwellMinutes: {
            $avg: {
              $divide: [{ $subtract: ['$timestamp', '$file.createdAt'] }, 60000],
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { avgDwellMinutes: -1 } },
      { $limit: 10 },
    ];

    const bottlenecks = await MovementHistory.aggregate(pipeline);
    res.json({ wardCode, bottlenecks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
