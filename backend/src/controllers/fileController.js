import mongoose from 'mongoose';
import { File, FILE_STATUSES } from '../models/File.js';
import { MovementHistory } from '../models/MovementHistory.js';
import { generateFileUid, generateTrackingId } from '../services/cryptoService.js';
import { generateQrCode, parseQrPayload } from '../services/qrService.js';
import { appendMovementLog, verifyLogChain } from '../services/ledgerService.js';

// Helper: Calculate processing time differences in minutes
function minutesBetween(a, b) {
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));
}

// Helper: Local fallback risk classification
function evaluateLocalRisk(file) {
  const ageHours = (Date.now() - new Date(file.updatedAt).getTime()) / 36e5;
  if (file.currentStatus === FILE_STATUSES.BACKTRACKED) {
    return { label: 'High', score: 85 };
  }
  if (ageHours > 48) {
    return { label: 'High', score: 75 };
  }
  if (ageHours > 24 || file.currentStatus === FILE_STATUSES.PENDING) {
    return { label: 'Medium', score: 50 };
  }
  return { label: 'Low', score: 15 };
}

/**
 * Register a physical file in the system.
 */
export async function registerFile(req, res, next) {
  try {
    const {
      title,
      citizenName,
      citizenPhone,
      documentType,
      requiredDocuments = [],
      internalNotes,
    } = req.body;

    if (!title || !citizenName || !citizenPhone || !documentType) {
      return res.status(400).json({
        error: 'title, citizenName, citizenPhone, and documentType are required',
      });
    }

    const cleanPhone = citizenPhone.trim();
    if (!/^\d{10}$/.test(cleanPhone)) {
      return res.status(400).json({ error: 'Citizen phone number must be exactly 10 digits' });
    }

    const fileUid = generateFileUid();
    const trackingId = generateTrackingId();
    const wardCode = req.user.wardCode || 'W01';
    const currentLocation = req.user.deskLocation || 'Reception';

    // Generate QR payload and image base64 data url
    const { payload, dataUrl } = await generateQrCode(fileUid, wardCode);

    const file = await File.create({
      fileUid,
      trackingId,
      title,
      citizenName,
      citizenPhone: cleanPhone,
      documentType,
      wardCode,
      currentStatus: FILE_STATUSES.RECEIVED,
      currentLocation,
      assignedOfficerId: req.user._id,
      qrPayload: payload,
      qrDataUrl: dataUrl,
      requiredDocuments,
      internalNotes,
    });

    // Write initial log to immutable ledger
    await appendMovementLog({
      fileId: file._id,
      officerId: req.user._id,
      actionType: FILE_STATUSES.RECEIVED,
      currentLocation,
      notes: `File registered: ${title}`,
    });

    return res.status(201).json({
      file: {
        id: file._id,
        fileUid: file.fileUid,
        trackingId: file.trackingId,
        title: file.title,
        currentStatus: file.currentStatus,
        currentLocation: file.currentLocation,
        qrPayload: file.qrPayload,
        qrDataUrl: file.qrDataUrl,
      },
      citizenTrackingUrl: `/track/${file.trackingId}`,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Returns dashboard telemetry summaries (metrics, queues, congestion, recent updates).
 */
export async function getDashboardSummary(req, res, next) {
  try {
    const wardCode = req.query.wardCode || req.user.wardCode;
    const allWards = req.query.allWards === 'true';
    const baseFilter = req.user.role === 'admin' && allWards ? {} : { wardCode };

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      statusCounts,
      todayFilesCount,
      recentFiles,
      recentHistory,
      departmentQueue,
      officerStats,
      completedMovements,
      backtrackTodayCount,
    ] = await Promise.all([
      // Status aggregates
      File.aggregate([
        { $match: { ...baseFilter, isClosed: false } },
        { $group: { _id: '$currentStatus', count: { $sum: 1 } } },
      ]),
      // Registered today
      File.countDocuments({ ...baseFilter, createdAt: { $gte: startOfToday } }),
      // Recent open files
      File.find({ ...baseFilter, isClosed: false })
        .sort({ updatedAt: -1 })
        .limit(8)
        .populate('assignedOfficerId', 'name deskLocation')
        .select('fileUid title citizenName documentType currentStatus currentLocation updatedAt createdAt requiredDocuments')
        .lean(),
      // System-wide updates
      MovementHistory.find({})
        .sort({ timestamp: -1 })
        .limit(12)
        .populate('fileId', 'fileUid title wardCode currentStatus')
        .populate('officerId', 'name deskLocation')
        .select('fileId officerId actionType currentLocation previousLocation timestamp notes backtrackReason')
        .lean(),
      // Group queue lengths by desk/location
      File.aggregate([
        { $match: { ...baseFilter, isClosed: false } },
        {
          $group: {
            _id: '$currentLocation',
            count: { $sum: 1 },
            pending: { $sum: { $cond: [{ $eq: ['$currentStatus', FILE_STATUSES.PENDING] }, 1, 0] } },
          },
        },
        { $sort: { count: -1 } },
      ]),
      // Officers load
      MovementHistory.aggregate([
        { $match: { timestamp: { $gte: startOfToday } } },
        {
          $group: {
            _id: '$officerId',
            processed: { $sum: 1 },
            backtracked: { $sum: { $cond: [{ $eq: ['$actionType', FILE_STATUSES.BACKTRACKED] }, 1, 0] } },
          },
        },
        { $sort: { processed: -1 } },
        { $limit: 6 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'officer' } },
        { $unwind: { path: '$officer', preserveNullAndEmptyArrays: true } },
        { $project: { processed: 1, backtracked: 1, name: '$officer.name', deskLocation: '$officer.deskLocation' } },
      ]),
      // Finished files list
      MovementHistory.find({ actionType: { $in: [FILE_STATUSES.APPROVED, FILE_STATUSES.DISPATCHED] } })
        .sort({ timestamp: -1 })
        .limit(100)
        .populate('fileId', 'createdAt wardCode')
        .select('fileId timestamp')
        .lean(),
      // Backtracks count today
      MovementHistory.countDocuments({
        actionType: FILE_STATUSES.BACKTRACKED,
        timestamp: { $gte: startOfToday },
      }),
    ]);

    // Parse status totals
    const counts = statusCounts.reduce((acc, item) => ({ ...acc, [item._id]: item.count }), {});

    // Compute average duration in minutes
    const completedDurations = completedMovements
      .filter((m) => m.fileId?.createdAt)
      .map((m) => minutesBetween(m.fileId.createdAt, m.timestamp));
    const averageProcessingMinutes = completedDurations.length
      ? Math.round(completedDurations.reduce((sum, val) => sum + val, 0) / completedDurations.length)
      : 0;

    const queueTotal = departmentQueue.reduce((sum, item) => sum + item.count, 0);
    const busiestSection = departmentQueue[0]?._id || 'Reception';
    const queueCongestion = queueTotal
      ? Math.min(0.95, departmentQueue[0].count / Math.max(queueTotal, 1) + 0.2)
      : 0.25;

    const hoursSinceToday = Math.max(1, (Date.now() - startOfToday.getTime()) / 36e5);
    const arrivalRate = Math.max(0.1, Number((todayFilesCount / hoursSinceToday).toFixed(2)));
    const serviceRate = Number(Math.max(arrivalRate + 0.3, arrivalRate / Math.max(queueCongestion, 0.2)).toFixed(2));

    // Enrich files with local prediction heuristics
    const enrichedFiles = recentFiles.map((file) => {
      const risk = evaluateLocalRisk(file);
      const missingDocs = (file.requiredDocuments || [])
        .filter((d) => /tax|citizen|recommendation|certificate/i.test(d))
        .slice(0, 2);

      return {
        ...file,
        ai: {
          risk,
          missingDocuments: missingDocs,
          citizenMessage: file.currentStatus === FILE_STATUSES.BACKTRACKED
            ? 'Your file requires updates before continuing.'
            : `Your application is currently under review in ${file.currentLocation}.`,
          estimatedCompletionHours: Math.max(2, Math.round(risk.score / 20 + departmentQueue.length)),
          predictionConfidence: risk.score > 70 ? 'medium' : 'high',
        },
      };
    });

    return res.json({
      wardCode,
      generatedAt: new Date().toISOString(),
      metrics: {
        todaysFiles: todayFilesCount,
        pendingFiles: counts[FILE_STATUSES.PENDING] || 0,
        approvedFiles: counts[FILE_STATUSES.APPROVED] || 0,
        rejectedFiles: counts[FILE_STATUSES.BACKTRACKED] || 0,
        completedFiles: (counts[FILE_STATUSES.DISPATCHED] || 0) + (counts[FILE_STATUSES.APPROVED] || 0),
        averageProcessingMinutes,
        averageQueueLength: queueTotal ? Number((queueTotal / Math.max(departmentQueue.length, 1)).toFixed(1)) : 0,
        backtrackingToday: backtrackTodayCount,
      },
      queuePrediction: {
        arrivalRate,
        serviceRate,
        utilization: Number((arrivalRate / serviceRate).toFixed(2)),
        expectedWaitingMinutes: Math.round(60 / Math.max(serviceRate - arrivalRate, 0.2)),
        averageQueueLength: queueTotal ? Number((queueTotal / Math.max(departmentQueue.length, 1)).toFixed(1)) : 0,
        predictionConfidence: recentHistory.length > 5 ? 'high' : 'medium',
      },
      ai: {
        bottleneckDepartment: busiestSection,
        delayProbability: queueCongestion > 0.8 ? 75 : queueCongestion > 0.5 ? 45 : 15,
        riskScore: Math.round(queueCongestion * 100),
        missingDocumentAlerts: enrichedFiles.reduce((sum, f) => sum + f.ai.missingDocuments.length, 0),
        recommendation: queueCongestion > 0.8
          ? `High traffic detected at ${busiestSection}. Consider allocating desk assistance.`
          : 'Queue metrics normal. Operations running smoothly.',
      },
      departmentQueue,
      officerStats,
      recentFiles: enrichedFiles,
      recentHistory,
      notifications: enrichedFiles.slice(0, 5).map((f) => ({
        id: f._id,
        title: f.currentStatus === FILE_STATUSES.BACKTRACKED ? 'File Backtracked' : 'File Updated',
        message: `${f.fileUid} has moved to ${f.currentLocation}`,
        severity: f.currentStatus === FILE_STATUSES.BACKTRACKED ? 'alert' : f.currentStatus === FILE_STATUSES.PENDING ? 'pending' : 'success',
      })),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Scan QR tag or File UID.
 */
export async function scanFile(req, res, next) {
  try {
    const rawIdentifier = decodeURIComponent(req.params.identifier);
    const fileUid = parseQrPayload(rawIdentifier);

    const file = await File.findOne({ fileUid })
      .populate('assignedOfficerId', 'name deskLocation')
      .lean();

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const recentHistory = await MovementHistory.find({ fileId: file._id })
      .sort({ timestamp: -1 })
      .limit(10)
      .populate('officerId', 'name')
      .select('-internalNotes')
      .lean();

    // Verify blockchain ledger integrity
    const integrityReport = await verifyLogChain(file._id);

    return res.json({
      file: {
        id: file._id,
        fileUid: file.fileUid,
        trackingId: file.trackingId,
        title: file.title,
        citizenName: file.citizenName,
        documentType: file.documentType,
        currentStatus: file.currentStatus,
        currentLocation: file.currentLocation,
        wardCode: file.wardCode,
        requiredDocuments: file.requiredDocuments,
        assignedOfficer: file.assignedOfficerId,
        updatedAt: file.updatedAt,
      },
      recentHistory,
      auditChainValid: integrityReport.valid,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Forward a file to another desk or location.
 */
export async function forwardFile(req, res, next) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { nextLocation, nextStatus = FILE_STATUSES.PENDING, notes } = req.body;

    if (!nextLocation) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: 'nextLocation is required' });
    }

    const file = await File.findById(req.params.id).session(session);
    if (!file) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: 'File not found' });
    }

    const previousLocation = file.currentLocation;
    file.currentLocation = nextLocation;
    file.currentStatus = nextStatus;
    await file.save({ session });

    // Append to ledger inside the session
    const logEntry = await appendMovementLog({
      fileId: file._id,
      officerId: req.user._id,
      actionType: nextStatus,
      currentLocation: nextLocation,
      previousLocation,
      nextLocation,
      notes,
      session,
    });

    await session.commitTransaction();
    session.endSession();

    return res.json({
      file: {
        id: file._id,
        fileUid: file.fileUid,
        currentStatus: file.currentStatus,
        currentLocation: file.currentLocation,
      },
      movement: {
        actionType: logEntry.actionType,
        timestamp: logEntry.timestamp,
        entryHash: logEntry.entryHash,
      },
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
}

/**
 * Backtrack a file (reject/return for correction with a description reason).
 */
export async function backtrackFile(req, res, next) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { returnLocation, backtrackReason, internalNotes } = req.body;

    if (!returnLocation || !backtrackReason) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: 'returnLocation and backtrackReason are required' });
    }

    const file = await File.findById(req.params.id).session(session);
    if (!file) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: 'File not found' });
    }

    const previousLocation = file.currentLocation;
    file.currentLocation = returnLocation;
    file.currentStatus = FILE_STATUSES.BACKTRACKED;
    await file.save({ session });

    // Append ledger entry (marked as backtracked)
    const logEntry = await appendMovementLog({
      fileId: file._id,
      officerId: req.user._id,
      actionType: FILE_STATUSES.BACKTRACKED,
      currentLocation: returnLocation,
      previousLocation,
      backtrackReason,
      internalNotes,
      notes: `Backtracked: ${backtrackReason}`,
      session,
    });

    await session.commitTransaction();
    session.endSession();

    return res.json({
      file: {
        id: file._id,
        fileUid: file.fileUid,
        currentStatus: file.currentStatus,
        currentLocation: file.currentLocation,
      },
      movement: {
        actionType: logEntry.actionType,
        backtrackReason: logEntry.backtrackReason,
        timestamp: logEntry.timestamp,
        entryHash: logEntry.entryHash,
      },
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
}

/**
 * Search active files with filters.
 */
export async function searchFiles(req, res, next) {
  try {
    const { q, status, wardCode, limit = 20 } = req.query;
    const filter = { isClosed: false };

    if (status) filter.currentStatus = status;
    if (wardCode) filter.wardCode = wardCode;
    else if (req.user.role === 'officer') filter.wardCode = req.user.wardCode;

    if (q) {
      const regex = new RegExp(q.trim(), 'i');
      filter.$or = [
        { fileUid: regex },
        { trackingId: regex },
        { citizenName: regex },
        { title: regex },
      ];
    }

    const files = await File.find(filter)
      .select('fileUid trackingId title citizenName currentStatus currentLocation updatedAt')
      .sort({ updatedAt: -1 })
      .limit(Math.min(Number(limit), 50))
      .lean();

    return res.json({ files, count: files.length });
  } catch (err) {
    next(err);
  }
}
