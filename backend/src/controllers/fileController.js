import mongoose from 'mongoose';
import { File, FILE_STATUSES } from '../models/File.js';
import { MovementHistory } from '../models/MovementHistory.js';
import { Department } from '../models/Department.js';
import { User } from '../models/User.js';
import { SmsLog } from '../models/SmsLog.js';
import { generateFileUid, generateTrackingId } from '../services/cryptoService.js';
import { generateQrCode, parseQrPayload } from '../services/qrService.js';
import { appendMovementLog, verifyLogChain } from '../services/ledgerService.js';
import { sendSmsNotification } from '../services/smsService.js';
import { sendEmailNotification } from '../services/emailService.js';

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
      citizenEmail,
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

    let fileUid = '';
    let trackingId = '';
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 10) {
      fileUid = generateFileUid();
      trackingId = generateTrackingId();
      
      const existing = await File.findOne({
        $or: [{ fileUid }, { trackingId }],
      });
      if (!existing) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      return res.status(500).json({ error: 'Unique identifier generation failed. Please try again.' });
    }

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
      citizenEmail: citizenEmail ? citizenEmail.trim().toLowerCase() : undefined,
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

    // Notify citizen via SMS on initial registration status
    const smsResult = await sendSmsNotification({
      file,
      status: FILE_STATUSES.RECEIVED,
      location: currentLocation,
    });

    // Notify citizen via Email if email address was provided
    const emailResult = await sendEmailNotification({
      file,
      status: FILE_STATUSES.RECEIVED,
      location: currentLocation,
    });

    return res.status(201).json({
      success: true,
      file: {
        id: file._id,
        fileUid: file.fileUid,
        trackingId: file.trackingId,
        title: file.title,
        citizenName: file.citizenName,
        citizenPhone: file.citizenPhone,
        citizenEmail: file.citizenEmail,
        currentStatus: file.currentStatus,
        currentLocation: file.currentLocation,
        qrPayload: file.qrPayload,
        qrDataUrl: file.qrDataUrl,
      },
      smsNotified: smsResult?.success ?? false,
      emailNotified: emailResult?.success ?? false,
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

    // Ward isolation for MovementHistory: MovementHistory has no wardCode field of
    // its own (only a fileId reference), so we resolve the set of file IDs visible
    // under baseFilter once and reuse it to scope every MovementHistory query below
    // the same way the File queries are already scoped. For admins with
    // allWards=true, baseFilter is {} so this resolves to every file (unchanged
    // behavior); for officers (and non-allWards admins) it resolves to only their
    // ward's files, preventing cross-ward movement data from leaking into the
    // response.
    const wardFileIds = await File.find(baseFilter).distinct('_id');

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
      // Ward-scoped updates (restricted to files visible under baseFilter)
      MovementHistory.find({ fileId: { $in: wardFileIds } })
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
      // Officers load (restricted to movements on files visible under baseFilter)
      MovementHistory.aggregate([
        { $match: { timestamp: { $gte: startOfToday }, fileId: { $in: wardFileIds } } },
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
      // Finished files list (restricted to files visible under baseFilter)
      MovementHistory.find({
        actionType: { $in: [FILE_STATUSES.APPROVED, FILE_STATUSES.DISPATCHED] },
        fileId: { $in: wardFileIds },
      })
        .sort({ timestamp: -1 })
        .limit(100)
        .populate('fileId', 'createdAt wardCode')
        .select('fileId timestamp')
        .lean(),
      // Backtracks count today (restricted to files visible under baseFilter)
      MovementHistory.countDocuments({
        actionType: FILE_STATUSES.BACKTRACKED,
        timestamp: { $gte: startOfToday },
        fileId: { $in: wardFileIds },
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
      success: true,
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
      success: true,
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
 * Helper to run write operations inside a session transaction.
 * Automatically falls back to standard non-transactional writes if
 * MongoDB is running in standalone mode (no replica sets configured).
 */
async function runTransactionalWrite(operationsFn) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const result = await operationsFn(session);
    await session.commitTransaction();
    session.endSession();
    return result;
  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();

    if (err.message.includes('replica set') || err.message.includes('Transaction numbers')) {
      console.warn('[TRANSACTION FALLBACK] MongoDB running in standalone mode. Executing operations without transaction.');
      return await operationsFn(null);
    }
    throw err;
  }
}

/**
 * Forward a file to another desk or location.
 * Dispatching without an explicit target routes the file to the ward's
 * archives desk (where closed physical files are stored); other final
 * statuses close the file at its current desk.
 */
export async function forwardFile(req, res, next) {
  try {
    const { nextLocation, nextStatus = FILE_STATUSES.PENDING, notes } = req.body;

    const isFinalStatus = [FILE_STATUSES.APPROVED, FILE_STATUSES.DISPATCHED, FILE_STATUSES.REJECTED].includes(nextStatus);

    if (!nextLocation && !isFinalStatus) {
      return res.status(400).json({ error: 'nextLocation is required' });
    }

    const result = await runTransactionalWrite(async (session) => {
      const file = await File.findById(req.params.id).session(session);
      if (!file) {
        throw new Error('File not found');
      }
      if (file.isClosed) {
        throw new Error('File closed');
      }

      const previousLocation = file.currentLocation;
      let targetLocation = nextLocation || file.currentLocation;

      // Dispatched files are physically moved to long-term storage: when no
      // target desk was chosen, default to the ward's archives desk.
      if (nextStatus === FILE_STATUSES.DISPATCHED && !nextLocation) {
        const archiveDesk = await Department.findOne({
          wardCode: file.wardCode,
          isActive: true,
          name: /archive/i,
        })
          .session(session)
          .lean();
        if (archiveDesk) targetLocation = archiveDesk.name;
      }

      file.currentLocation = targetLocation;
      file.currentStatus = nextStatus;
      if (isFinalStatus) {
        file.isClosed = true;
      } else {
        file.isClosed = false;
      }
      await file.save({ session });

      const logEntry = await appendMovementLog({
        fileId: file._id,
        officerId: req.user._id,
        actionType: nextStatus,
        currentLocation: targetLocation,
        previousLocation,
        nextLocation: targetLocation,
        notes,
        session,
      });

      return { file, logEntry };
    });

    // Notify citizen via SMS on status transition
    const smsResult = await sendSmsNotification({
      file: result.file,
      status: result.file.currentStatus,
      location: result.file.currentLocation,
      notes,
    });

    // Notify citizen via Email on status transition
    const emailResult = await sendEmailNotification({
      file: result.file,
      status: result.file.currentStatus,
      location: result.file.currentLocation,
      notes,
    });

    return res.json({
      success: true,
      file: {
        id: result.file._id,
        fileUid: result.file.fileUid,
        currentStatus: result.file.currentStatus,
        currentLocation: result.file.currentLocation,
      },
      movement: {
        actionType: result.logEntry.actionType,
        timestamp: result.logEntry.timestamp,
        entryHash: result.logEntry.entryHash,
      },
      smsNotified: smsResult?.success ?? false,
      emailNotified: emailResult?.success ?? false,
    });
  } catch (err) {
    if (err.message === 'File not found') {
      return res.status(404).json({ error: 'File not found' });
    }
    if (err.message === 'File closed') {
      return res.status(400).json({ error: 'This file is already closed. Closed files cannot be forwarded.' });
    }
    next(err);
  }
}

/**
 * Backtrack a file (reject/return for correction with a description reason).
 */
export async function backtrackFile(req, res, next) {
  try {
    const { returnLocation, backtrackReason, internalNotes } = req.body;

    if (!returnLocation || !backtrackReason) {
      return res.status(400).json({ error: 'returnLocation and backtrackReason are required' });
    }

    const result = await runTransactionalWrite(async (session) => {
      const file = await File.findById(req.params.id).session(session);
      if (!file) {
        throw new Error('File not found');
      }
      if (file.isClosed) {
        throw new Error('File closed');
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

      return { file, logEntry };
    });

    // Notify citizen via SMS on backtrack event
    const smsResult = await sendSmsNotification({
      file: result.file,
      status: FILE_STATUSES.BACKTRACKED,
      location: returnLocation,
      notes: backtrackReason,
    });

    // Notify citizen via Email on backtrack event
    const emailResult = await sendEmailNotification({
      file: result.file,
      status: FILE_STATUSES.BACKTRACKED,
      location: returnLocation,
      notes: backtrackReason,
    });

    return res.json({
      success: true,
      file: {
        id: result.file._id,
        fileUid: result.file.fileUid,
        currentStatus: result.file.currentStatus,
        currentLocation: result.file.currentLocation,
      },
      movement: {
        actionType: result.logEntry.actionType,
        backtrackReason: result.logEntry.backtrackReason,
        timestamp: result.logEntry.timestamp,
        entryHash: result.logEntry.entryHash,
      },
      smsNotified: smsResult?.success ?? false,
      emailNotified: emailResult?.success ?? false,
    });
  } catch (err) {
    if (err.message === 'File not found') {
      return res.status(404).json({ error: 'File not found' });
    }
    if (err.message === 'File closed') {
      return res.status(400).json({ error: 'This file is already closed. Closed files cannot be backtracked.' });
    }
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

    return res.json({ success: true, files, count: files.length });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieve open files for the officer's inbox.
 * `scope=ward` (default) returns every open file in the officer's ward;
 * `scope=desk` narrows to files currently sitting at the officer's own desk
 * (powers the header notification bell). `limit` caps the result set.
 */
export async function getOfficerInbox(req, res, next) {
  try {
    const wardCode = req.user.wardCode;
    const { scope = 'ward', limit } = req.query;

    const filter = { wardCode, isClosed: false };
    if (scope === 'desk') filter.currentLocation = req.user.deskLocation;

    let query = File.find(filter)
      .select('fileUid trackingId title citizenName currentStatus currentLocation updatedAt createdAt')
      .sort({ updatedAt: -1 })
      .limit(Math.min(Number(limit) || 200, 200));

    // Officer attribution only matters for the ward-wide queue view
    if (scope !== 'desk') query = query.populate('assignedOfficerId', 'name deskLocation');

    const files = await query.lean();

    return res.json({
      success: true,
      files,
      count: files.length,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Paginated movement-ledger activity feed.
 * - Officers see only the movements they performed themselves (their audit trail).
 * - Admins see every movement in their ward, and can narrow to a single
 *   officer via ?officerId= (e.g. to review one officer's work).
 * Optional filters: ?action=<status>, ?from=<ISO date>, ?to=<ISO date>.
 * Pagination: ?page= (1-based) and ?limit= (max 100).
 */
export async function getActivityLog(req, res, next) {
  try {
    const { officerId, action, from, to } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(Math.max(1, Number(req.query.limit) || 25), 100);
    const isAdmin = req.user.role === 'admin';

    const filter = {};

    if (!isAdmin) {
      // Officers may only audit their own actions
      filter.officerId = req.user._id;
    } else if (officerId) {
      if (!mongoose.Types.ObjectId.isValid(officerId)) {
        return res.status(400).json({ success: false, error: 'Invalid officerId filter' });
      }
      // Admins can filter to one officer, but only within their own ward
      const target = await User.findOne({ _id: officerId, wardCode: req.user.wardCode }).select('_id').lean();
      if (!target) {
        return res.status(404).json({ success: false, error: 'Officer not found in your ward' });
      }
      filter.officerId = officerId;
    }

    if (action && Object.values(FILE_STATUSES).includes(action)) {
      filter.actionType = action;
    }

    if (from || to) {
      filter.timestamp = {};
      if (from && !Number.isNaN(Date.parse(from))) filter.timestamp.$gte = new Date(from);
      if (to && !Number.isNaN(Date.parse(to))) filter.timestamp.$lte = new Date(to);
      if (Object.keys(filter.timestamp).length === 0) delete filter.timestamp;
    }

    // Ward isolation: MovementHistory has no wardCode, so scope through the
    // ward's file ids (same pattern as the dashboard summary). Officers are
    // already scoped by officerId but stay ward-bounded too in case they
    // acted in another ward before a transfer.
    const wardFileIds = await File.find({ wardCode: req.user.wardCode }).distinct('_id');
    filter.fileId = { $in: wardFileIds };

    const [total, movements] = await Promise.all([
      MovementHistory.countDocuments(filter),
      MovementHistory.find(filter)
        .sort({ timestamp: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('fileId', 'fileUid trackingId title citizenName documentType currentStatus')
        .populate('officerId', 'name deskLocation role')
        .select('fileId officerId actionType currentLocation previousLocation timestamp notes backtrackReason')
        .lean(),
    ]);

    return res.json({
      success: true,
      movements,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieve SMS dispatch log history for a specific file.
 */
export async function getFileSmsLogs(req, res, next) {
  try {
    const fileId = req.params.id;
    const file = await File.findById(fileId).select('fileUid citizenName citizenPhone').lean();
    if (!file) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    const smsLogs = await SmsLog.find({ fileId })
      .sort({ sentAt: -1 })
      .lean();

    return res.json({
      success: true,
      citizenPhone: file.citizenPhone,
      citizenName: file.citizenName,
      logs: smsLogs,
      count: smsLogs.length,
    });
  } catch (err) {
    next(err);
  }
}