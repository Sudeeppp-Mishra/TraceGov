import { File, FILE_STATUSES } from '../models/File.js';
import { MovementHistory } from '../models/MovementHistory.js';
import { SmsLog } from '../models/SmsLog.js';

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
    const [movements, smsCount] = await Promise.all([
      MovementHistory.find({ fileId: file._id })
        .sort({ timestamp: 1 })
        .select('actionType currentLocation timestamp notes backtrackReason -_id')
        .lean(),
      SmsLog.countDocuments({ fileId: file._id, deliveryStatus: { $ne: 'failed' } }),
    ]);

    // Format logs into citizen-friendly language. Public tracking should explain
    // delays and correction loops clearly without exposing internal officer notes.
    const citizenTimeline = movements.map((log) => {
      let displayMessage = log.notes || log.actionType;

      if (log.actionType === FILE_STATUSES.BACKTRACKED) {
        displayMessage = log.backtrackReason
          ? `Returned for correction: ${log.backtrackReason}`
          : 'Returned for correction. Please contact the current desk for details.';
      } else if (displayMessage.startsWith('Backtracked:')) {
        displayMessage = displayMessage.replace(/^Backtracked:\s*/i, 'Returned for correction: ');
      }

      return {
        status: log.actionType,
        location: log.currentLocation,
        timestamp: log.timestamp,
        message: displayMessage,
        requiresCitizenAction: log.actionType === FILE_STATUSES.BACKTRACKED,
      };
    });

    // Mask phone number for citizen privacy (e.g. 9841234567 -> 98****4567)
    const rawPhone = file.citizenPhone || '';
    const maskedPhone = rawPhone.length >= 10
      ? `${rawPhone.slice(0, 2)}****${rawPhone.slice(-4)}`
      : rawPhone;

    return res.json({
      trackingId: file.trackingId,
      fileUid: file.fileUid,
      title: file.title,
      citizenName: file.citizenName,
      citizenPhoneMasked: maskedPhone,
      documentType: file.documentType,
      currentStatus: file.currentStatus,
      currentLocation: file.currentLocation,
      wardCode: file.wardCode,
      registeredAt: file.createdAt,
      lastUpdated: file.updatedAt,
      smsNotificationsActive: true,
      smsNotificationsSent: smsCount,
      timeline: citizenTimeline,
    });
  } catch (err) {
    next(err);
  }
}
