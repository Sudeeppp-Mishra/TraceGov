import { File, FILE_STATUSES } from '../models/File.js';
import { MovementHistory } from '../models/MovementHistory.js';

/**
 * Public lookup for citizens to view file status using their Tracking ID.
 * Securely sanitizes database fields before responding.
 */
export async function trackFile(req, res, next) {
  try {
    const trackingId = req.params.trackingId.toUpperCase().trim();

    // Query file by trackingId OR fileUid
    const file = await File.findOne({
      $or: [
        { trackingId },
        { fileUid: trackingId }
      ]
    })
      .select('-internalNotes -qrPayload -assignedOfficerId')
      .lean();

    if (!file) {
      return res.status(404).json({ error: 'Tracking ID or File UID not found in database records' });
    }

    // Retrieve ledger, excluding unique primary keys and private officer logs
    const movements = await MovementHistory.find({ fileId: file._id })
      .sort({ timestamp: 1 })
      .select('actionType currentLocation timestamp notes backtrackReason -_id')
      .lean();

    // Format logs into citizen-friendly language
    const citizenTimeline = movements.map((log) => {
      let displayMessage = log.notes || log.actionType;

      if (log.actionType === FILE_STATUSES.BACKTRACKED) {
        displayMessage = 'Returned for corrections';
      } else if (displayMessage.startsWith('Backtracked:')) {
        displayMessage = 'Processing update under review';
      }

      return {
        status: log.actionType,
        location: log.currentLocation,
        timestamp: log.timestamp,
        message: displayMessage,
      };
    });

    return res.json({
      trackingId: file.trackingId,
      title: file.title,
      documentType: file.documentType,
      currentStatus: file.currentStatus,
      currentLocation: file.currentLocation,
      wardCode: file.wardCode,
      registeredAt: file.createdAt,
      lastUpdated: file.updatedAt,
      timeline: citizenTimeline,
    });
  } catch (err) {
    next(err);
  }
}
