import { Router } from 'express';
import mongoose from 'mongoose';
import { File } from '../models/File.js';
import { MovementHistory } from '../models/MovementHistory.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { appendMovementLog, verifyLogChain } from '../services/movementLog.js';
import { generateFileUid, generateTrackingId } from '../utils/crypto.js';
import { generateQrCode, parseQrPayload } from '../utils/qr.js';

const router = Router();

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

    if (!title || !citizenName || !documentType) {
      return res.status(400).json({
        error: 'title, citizenName, and documentType are required',
      });
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
      citizenPhone,
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
