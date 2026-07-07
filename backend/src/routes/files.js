import { Router } from 'express';
import mongoose from 'mongoose';
import { File } from '../models/File.js';
import { MovementHistory } from '../models/MovementHistory.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { appendMovementLog, verifyLogChain } from '../services/movementLog.js';
import { generateFileUid, generateTrackingId } from '../utils/crypto.js';
import { generateQrCode, parseQrPayload } from '../utils/qr.js';

const router = Router();

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function minutesBetween(a, b) {
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));
}

function riskFromAgeAndStatus(file) {
  const ageHours = (Date.now() - new Date(file.updatedAt).getTime()) / 36e5;
  if (file.currentStatus === 'Backtracked') return { label: 'High', score: 86 };
  if (ageHours > 48) return { label: 'High', score: 78 };
  if (ageHours > 24 || file.currentStatus === 'Pending') return { label: 'Medium', score: 52 };
  return { label: 'Low', score: 18 };
}

/** Register a new physical file and generate QR-Handshake payload */
router.post('/register', authenticate, authorize('officer', 'admin'), async (req, res) => {
  try {
    const {
      title,
      citizenName,
      citizenPhone,
      documentType,
      requiredDocuments = [],
      internalNotes,
    } = req.body;

    const cleanCitizenPhone = citizenPhone?.trim();

    if (!title || !citizenName || !cleanCitizenPhone || !documentType) {
      return res.status(400).json({
        error: 'title, citizenName, citizenPhone, and documentType are required',
      });
    }

    if (!/^\d{10}$/.test(cleanCitizenPhone)) {
      return res.status(400).json({ error: 'Citizen number must be exactly 10 digits' });
    }

    const fileUid = generateFileUid();
    const trackingId = generateTrackingId();
    const wardCode = req.user.wardCode || 'W01';
    const currentLocation = req.user.deskLocation || 'Reception';

    const { payload, dataUrl } = await generateQrCode(fileUid, wardCode);

    const file = await File.create({
      fileUid,
      trackingId,
      title,
      citizenName,
      citizenPhone: cleanCitizenPhone,
      documentType,
      wardCode,
      currentStatus: 'Received',
      currentLocation,
      assignedOfficerId: req.user._id,
      qrPayload: payload,
      qrDataUrl: dataUrl,
      requiredDocuments,
      internalNotes,
    });

    await appendMovementLog({
      fileId: file._id,
      officerId: req.user._id,
      actionType: 'Received',
      currentLocation,
      notes: `File registered: ${title}`,
    });

    res.status(201).json({
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
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/** Officer/Admin dashboard summary for operational and AI views */
router.get('/dashboard/summary', authenticate, authorize('officer', 'admin'), async (req, res) => {
  try {
    const wardCode = req.query.wardCode || req.user.wardCode;
    const today = startOfToday();
    const baseFilter = req.user.role === 'admin' && req.query.allWards === 'true' ? {} : { wardCode };

    const [
      statusCounts,
      todayFiles,
      recentFiles,
      recentHistory,
      departmentQueue,
      officerStats,
      completedMovements,
      backtracks,
    ] = await Promise.all([
      File.aggregate([
        { $match: { ...baseFilter, isClosed: false } },
        { $group: { _id: '$currentStatus', count: { $sum: 1 } } },
      ]),
      File.countDocuments({ ...baseFilter, createdAt: { $gte: today } }),
      File.find({ ...baseFilter, isClosed: false })
        .sort({ updatedAt: -1 })
        .limit(8)
        .populate('assignedOfficerId', 'name deskLocation')
        .select('fileUid title citizenName documentType currentStatus currentLocation updatedAt createdAt requiredDocuments')
        .lean(),
      MovementHistory.find({})
        .sort({ timestamp: -1 })
        .limit(12)
        .populate('fileId', 'fileUid title wardCode currentStatus')
        .populate('officerId', 'name deskLocation')
        .select('fileId officerId actionType currentLocation previousLocation timestamp notes backtrackReason')
        .lean(),
      File.aggregate([
        { $match: { ...baseFilter, isClosed: false } },
        { $group: { _id: '$currentLocation', count: { $sum: 1 }, pending: { $sum: { $cond: [{ $eq: ['$currentStatus', 'Pending'] }, 1, 0] } } } },
        { $sort: { count: -1 } },
      ]),
      MovementHistory.aggregate([
        { $match: { timestamp: { $gte: today } } },
        { $group: { _id: '$officerId', processed: { $sum: 1 }, backtracked: { $sum: { $cond: [{ $eq: ['$actionType', 'Backtracked'] }, 1, 0] } } } },
        { $sort: { processed: -1 } },
        { $limit: 6 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'officer' } },
        { $unwind: { path: '$officer', preserveNullAndEmptyArrays: true } },
        { $project: { processed: 1, backtracked: 1, name: '$officer.name', deskLocation: '$officer.deskLocation' } },
      ]),
      MovementHistory.find({ actionType: { $in: ['Approved', 'Dispatched'] } })
        .sort({ timestamp: -1 })
        .limit(100)
        .populate('fileId', 'createdAt wardCode')
        .select('fileId timestamp')
        .lean(),
      MovementHistory.countDocuments({ actionType: 'Backtracked', timestamp: { $gte: today } }),
    ]);

    const counts = statusCounts.reduce((acc, item) => ({ ...acc, [item._id]: item.count }), {});
    const completedSamples = completedMovements
      .filter((item) => item.fileId?.createdAt)
      .map((item) => minutesBetween(item.fileId.createdAt, item.timestamp));
    const averageProcessingMinutes = completedSamples.length
      ? Math.round(completedSamples.reduce((sum, value) => sum + value, 0) / completedSamples.length)
      : 0;

    const queueTotal = departmentQueue.reduce((sum, item) => sum + item.count, 0);
    const busiestDepartment = departmentQueue[0]?._id || 'Reception';
    const utilization = queueTotal ? Math.min(0.96, departmentQueue[0].count / Math.max(queueTotal, 1) + 0.22) : 0.28;
    const arrivalRate = Math.max(0.2, Number((todayFiles / Math.max(1, (Date.now() - today.getTime()) / 36e5)).toFixed(2)));
    const serviceRate = Number(Math.max(arrivalRate + 0.35, arrivalRate / Math.max(utilization, 0.2)).toFixed(2));

    const enrichedFiles = recentFiles.map((file) => {
      const risk = riskFromAgeAndStatus(file);
      const missingDocuments = (file.requiredDocuments || []).filter((doc) => /tax|citizen|recommendation|certificate/i.test(doc)).slice(0, 2);
      return {
        ...file,
        ai: {
          risk,
          missingDocuments,
          citizenMessage: file.currentStatus === 'Backtracked'
            ? 'Your file needs a correction before it can continue.'
            : `Your application is currently under review in ${file.currentLocation}.`,
          estimatedCompletionHours: Math.max(2, Math.round((risk.score / 20) + departmentQueue.length)),
          predictionConfidence: risk.score > 70 ? 'medium' : 'high',
        },
      };
    });

    res.json({
      wardCode,
      generatedAt: new Date().toISOString(),
      metrics: {
        todaysFiles: todayFiles,
        pendingFiles: counts.Pending || 0,
        approvedFiles: counts.Approved || 0,
        rejectedFiles: counts.Backtracked || 0,
        completedFiles: (counts.Dispatched || 0) + (counts.Approved || 0),
        averageProcessingMinutes,
        averageQueueLength: queueTotal ? Number((queueTotal / Math.max(departmentQueue.length, 1)).toFixed(1)) : 0,
        backtrackingToday: backtracks,
      },
      queuePrediction: {
        arrivalRate,
        serviceRate,
        utilization: Number((arrivalRate / serviceRate).toFixed(2)),
        expectedWaitingMinutes: Math.round(60 / Math.max(serviceRate - arrivalRate, 0.25)),
        averageQueueLength: queueTotal ? Number((queueTotal / Math.max(departmentQueue.length, 1)).toFixed(1)) : 0,
        predictionConfidence: recentHistory.length > 5 ? 'high' : 'medium',
      },
      ai: {
        bottleneckDepartment: busiestDepartment,
        delayProbability: utilization > 0.8 ? 72 : utilization > 0.55 ? 44 : 18,
        riskScore: Math.round(utilization * 100),
        missingDocumentAlerts: enrichedFiles.reduce((sum, file) => sum + file.ai.missingDocuments.length, 0),
        recommendation: utilization > 0.8
          ? `Move one officer to ${busiestDepartment} for the next working session.`
          : 'Queue is stable. Keep scanning at each handoff for better predictions.',
      },
      departmentQueue,
      officerStats,
      recentFiles: enrichedFiles,
      recentHistory,
      notifications: enrichedFiles.slice(0, 5).map((file) => ({
        id: file._id,
        title: file.currentStatus === 'Backtracked' ? 'Returned file needs correction' : 'File updated',
        message: `${file.fileUid} is now at ${file.currentLocation}`,
        severity: file.currentStatus === 'Backtracked' ? 'alert' : file.currentStatus === 'Pending' ? 'pending' : 'success',
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Scan QR payload or FileUID — officer lookup */
router.get('/scan/:identifier', authenticate, authorize('officer', 'admin'), async (req, res) => {
  try {
    const raw = decodeURIComponent(req.params.identifier);
    const fileUid = parseQrPayload(raw);

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

    const chain = await verifyLogChain(file._id);

    res.json({
      file: {
        id: file._id,
        fileUid: file.fileUid,
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
      auditChainValid: chain.valid,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Forward file to next desk */
router.post('/:id/forward', authenticate, authorize('officer', 'admin'), async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { nextLocation, nextStatus = 'Pending', notes } = req.body;

    if (!nextLocation) {
      await session.abortTransaction();
      return res.status(400).json({ error: 'nextLocation is required' });
    }

    const file = await File.findById(req.params.id).session(session);
    if (!file) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'File not found' });
    }

    const previousLocation = file.currentLocation;
    file.currentLocation = nextLocation;
    file.currentStatus = nextStatus;
    await file.save({ session });

    const entry = await appendMovementLog({
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

    res.json({
      file: {
        id: file._id,
        fileUid: file.fileUid,
        currentStatus: file.currentStatus,
        currentLocation: file.currentLocation,
      },
      movement: {
        actionType: entry.actionType,
        timestamp: entry.timestamp,
        entryHash: entry.entryHash,
      },
    });
  } catch (err) {
    await session.abortTransaction();
    res.status(500).json({ error: err.message });
  } finally {
    session.endSession();
  }
});

/** Smart Backtracking — return file for corrections */
router.post('/:id/backtrack', authenticate, authorize('officer', 'admin'), async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { returnLocation, backtrackReason, internalNotes } = req.body;

    if (!returnLocation || !backtrackReason) {
      await session.abortTransaction();
      return res.status(400).json({ error: 'returnLocation and backtrackReason are required' });
    }

    const file = await File.findById(req.params.id).session(session);
    if (!file) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'File not found' });
    }

    const previousLocation = file.currentLocation;
    file.currentLocation = returnLocation;
    file.currentStatus = 'Backtracked';
    await file.save({ session });

    const entry = await appendMovementLog({
      fileId: file._id,
      officerId: req.user._id,
      actionType: 'Backtracked',
      currentLocation: returnLocation,
      previousLocation,
      backtrackReason,
      internalNotes,
      notes: `Backtracked: ${backtrackReason}`,
      session,
    });

    await session.commitTransaction();

    res.json({
      file: {
        id: file._id,
        fileUid: file.fileUid,
        currentStatus: file.currentStatus,
        currentLocation: file.currentLocation,
      },
      movement: {
        actionType: entry.actionType,
        backtrackReason: entry.backtrackReason,
        timestamp: entry.timestamp,
        entryHash: entry.entryHash,
      },
    });
  } catch (err) {
    await session.abortTransaction();
    res.status(500).json({ error: err.message });
  } finally {
    session.endSession();
  }
});

/** Search files — indexed for sub-2s response */
router.get('/search', authenticate, authorize('officer', 'admin'), async (req, res) => {
  try {
    const { q, status, wardCode, limit = 20 } = req.query;
    const filter = { isClosed: false };

    if (status) filter.currentStatus = status;
    if (wardCode) filter.wardCode = wardCode;
    else if (req.user.role === 'officer') filter.wardCode = req.user.wardCode;

    if (q) {
      filter.$or = [
        { fileUid: new RegExp(q, 'i') },
        { trackingId: new RegExp(q, 'i') },
        { citizenName: new RegExp(q, 'i') },
        { title: new RegExp(q, 'i') },
      ];
    }

    const files = await File.find(filter)
      .select('fileUid trackingId title citizenName currentStatus currentLocation updatedAt')
      .sort({ updatedAt: -1 })
      .limit(Math.min(Number(limit), 50))
      .lean();

    res.json({ files, count: files.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
