import { Router } from 'express';
import { File } from '../models/File.js';
import { MovementHistory } from '../models/MovementHistory.js';

const router = Router();

/**
 * Citizen tracking portal — public, tracking-ID only.
 * Never exposes internalNotes, officer IDs, or backtrack internal reasons.
 */
router.get('/:trackingId', async (req, res) => {
  try {
    const file = await File.findOne({ trackingId: req.params.trackingId.toUpperCase() })
      .select('-internalNotes -qrPayload -assignedOfficerId')
      .lean();

    if (!file) {
      return res.status(404).json({ error: 'Tracking ID not found' });
    }

    const timeline = await MovementHistory.find({ fileId: file._id })
      .sort({ timestamp: 1 })
      .select('actionType currentLocation timestamp notes backtrackReason -_id')
      .lean();

    const publicTimeline = timeline.map((entry) => ({
      status: entry.actionType,
      location: entry.currentLocation,
      timestamp: entry.timestamp,
      message: entry.actionType === 'Backtracked'
        ? 'Returned for corrections'
        : entry.notes?.replace(/Backtracked:.*/, 'Processing update') || entry.actionType,
    }));

    res.json({
      trackingId: file.trackingId,
      title: file.title,
      documentType: file.documentType,
      currentStatus: file.currentStatus,
      currentLocation: file.currentLocation,
      wardCode: file.wardCode,
      registeredAt: file.createdAt,
      lastUpdated: file.updatedAt,
      timeline: publicTimeline,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
