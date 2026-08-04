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
import { aiAnalyzeDocument } from '../services/aiService.js';

// Helper: Calculate processing time differences in minutes
function minutesBetween(a, b) {
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));
}

// Helper: Normalize the AI service's stampAnalysis payload before persisting.
// Tier-3 #14: keep stampRegions[] (bounded to 5 entries per stamp detector)
// so the frontend can render bounding-box overlays over the scan preview.
function sanitizeStampAnalysis(sa) {
  if (!sa || typeof sa !== 'object') return undefined;
  const regions = Array.isArray(sa.stampRegions) ? sa.stampRegions.slice(0, 5) : [];
  return {
    stampDetected: !!sa.stampDetected,
    stampColor: sa.stampColor || null,
    stampConfidence: typeof sa.stampConfidence === 'number' ? sa.stampConfidence : 0,
    stampCount: typeof sa.stampCount === 'number' ? sa.stampCount : regions.length,
    stampRegions: regions.map((r) => ({
      area: typeof r.area === 'number' ? r.area : 0,
      circularity: typeof r.circularity === 'number' ? r.circularity : 0,
      boundingBox: {
        x: r.boundingBox?.x || 0,
        y: r.boundingBox?.y || 0,
        w: r.boundingBox?.w || 0,
        h: r.boundingBox?.h || 0,
      },
    })),
  };
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
      citizenNameNepali,
      citizenPhone,
      citizenEmail,
      documentType,
      requiredDocuments = [],
      internalNotes,
      documentVerification,
      documentVerifications = [],
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

    // Determine overall verification status and explicit list of missing document labels
    let verificationStatus = 'unverified';
    const missingDocs = [];

    if (Array.isArray(documentVerifications) && documentVerifications.length > 0) {
      documentVerifications.forEach((dv) => {
        if (dv.status !== 'verified' || (dv.missingKeywords && dv.missingKeywords.length > 0)) {
          if (dv.documentLabel && !missingDocs.includes(dv.documentLabel)) {
            missingDocs.push(dv.documentLabel);
          }
        }
      });

      if (Array.isArray(requiredDocuments)) {
        requiredDocuments.forEach((reqDoc) => {
          const match = documentVerifications.find(
            (dv) => dv.documentLabel?.toLowerCase().trim() === reqDoc.toLowerCase().trim()
          );
          if (!match || match.status !== 'verified') {
            if (!missingDocs.includes(reqDoc)) {
              missingDocs.push(reqDoc);
            }
          }
        });
      }

      verificationStatus = missingDocs.length > 0 ? 'missing-documents' : 'complete';
    } else if (documentVerification) {
      const legacyMissing = documentVerification.missingKeywords || documentVerification.missingDocuments || [];
      if (legacyMissing.length > 0) {
        missingDocs.push(...legacyMissing);
        verificationStatus = 'missing-documents';
      } else {
        verificationStatus = 'complete';
      }
    } else if (Array.isArray(requiredDocuments) && requiredDocuments.length > 0) {
      missingDocs.push(...requiredDocuments);
      verificationStatus = 'missing-documents';
    } else {
      verificationStatus = 'complete';
    }

    const file = await File.create({
      fileUid,
      trackingId,
      title,
      citizenName,
      citizenNameNepali: citizenNameNepali || undefined,
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
      verificationStatus,
      documentVerification: documentVerification ? {
        scannedAt: new Date(),
        detectedType: documentVerification.detectedType || documentVerification.documentType,
        ocrConfidence: documentVerification.ocrConfidence,
        qualityScore: documentVerification.qualityScore,
        completenessScore: documentVerification.completenessScore,
        detectedLanguage: documentVerification.detectedLanguage,
        isQualityPassed: documentVerification.isQualityPassed ?? true,
        missingKeywords: missingDocs,
        missingDocuments: missingDocs,
      } : undefined,
      documentVerifications: Array.isArray(documentVerifications) ? documentVerifications.map((dv) => ({
        documentLabel: dv.documentLabel || 'Attachment',
        imagePreview: dv.imagePreview || null,
        // Tier-3 #15: multi-page. Cap at 10 pages × 2MB each to keep the
        // Mongo document bounded; the frontend compresses before upload.
        imagePreviews: Array.isArray(dv.imagePreviews) && dv.imagePreviews.length > 0
          ? dv.imagePreviews.slice(0, 10).map((p) => String(p).slice(0, 2_000_000))
          : (dv.imagePreview ? [String(dv.imagePreview).slice(0, 2_000_000)] : []),
        pages: Array.isArray(dv.pages) ? dv.pages.slice(0, 10).map((p) => ({
          pageIndex: p.pageIndex || 0,
          extractedTextPreview: p.extractedTextPreview || '',
          extractedText: p.extractedText || '',
          completenessScore: p.completenessScore || 0,
          ocrConfidence: p.ocrConfidence || 0,
          imageWidth: p.imageWidth || 0,
          imageHeight: p.imageHeight || 0,
          textBoxes: Array.isArray(p.textBoxes) ? p.textBoxes : [],
        })) : [],
        scannedAt: dv.scannedAt || new Date(),
        detectedType: dv.detectedType || null,
        ocrConfidence: dv.ocrConfidence || 0,
        qualityScore: dv.qualityScore || 0.85,
        completenessScore: dv.completenessScore || 0,
        detectedLanguage: dv.detectedLanguage || 'unknown',
        isQualityPassed: dv.isQualityPassed ?? true,
        missingKeywords: dv.missingKeywords || [],
        status: dv.status || 'unverified',
        extractedTextPreview: dv.extractedTextPreview || null,
        extractedText: dv.extractedText || null,
        // Tier-3 #12: per-word bounding boxes for the side-by-side review modal.
        textBoxes: Array.isArray(dv.textBoxes) ? dv.textBoxes.slice(0, 200).map((tb) => ({
          text: String(tb.text || ''),
          bbox: Array.isArray(tb.bbox) ? tb.bbox.map((p) => [Number(p[0]) || 0, Number(p[1]) || 0]) : [],
          confidence: typeof tb.confidence === 'number' ? tb.confidence : 0,
        })) : [],
        imageWidth: typeof dv.imageWidth === 'number' ? dv.imageWidth : 0,
        imageHeight: typeof dv.imageHeight === 'number' ? dv.imageHeight : 0,
        imageQualityIssue: dv.imageQualityIssue ? {
          noTextDetected: !!dv.imageQualityIssue.noTextDetected,
          isBlurry: !!dv.imageQualityIssue.isBlurry,
          isDark: !!dv.imageQualityIssue.isDark,
          qualityScore: typeof dv.imageQualityIssue.qualityScore === 'number' ? dv.imageQualityIssue.qualityScore : 0,
          isQualityPassed: dv.imageQualityIssue.isQualityPassed ?? true,
          issueDescription: dv.imageQualityIssue.issueDescription || null,
        } : undefined,
        stampAnalysis: dv.stampAnalysis ? sanitizeStampAnalysis(dv.stampAnalysis) : undefined,
      })) : [],
    });

    // Write initial log to immutable ledger
    await appendMovementLog({
      fileId: file._id,
      officerId: req.user._id,
      actionType: FILE_STATUSES.RECEIVED,
      currentLocation,
      notes: missingDocs.length > 0 
        ? `File registered (Missing ${missingDocs.length} document(s)): ${title}`
        : `File registered: ${title}`,
    });

    // Notify citizen via SMS on initial registration status
    const smsResult = await sendSmsNotification({
      file,
      status: FILE_STATUSES.RECEIVED,
      location: currentLocation,
      missingDocuments: missingDocs,
    });

    // Notify citizen via Email if email address was provided
    const emailResult = await sendEmailNotification({
      file,
      status: FILE_STATUSES.RECEIVED,
      location: currentLocation,
      missingDocuments: missingDocs,
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
        verificationStatus: file.verificationStatus,
        missingDocuments: missingDocs,
        documentVerifications: file.documentVerifications,
      },
      missingDocuments: missingDocs,
      verificationStatus: file.verificationStatus,
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
        .select('fileUid title citizenName documentType currentStatus currentLocation updatedAt createdAt requiredDocuments documentVerification')
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
        documentVerification: file.documentVerification || null,
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
 * Uses the unified Send core engine.
 */
export async function forwardFile(req, res, next) {
  try {
    const {
      nextLocation,
      nextStatus = FILE_STATUSES.PENDING,
      notes,
    } = req.body;

    const isFinalStatus = [FILE_STATUSES.APPROVED, FILE_STATUSES.DISPATCHED, FILE_STATUSES.REJECTED].includes(nextStatus);

    if (!nextLocation && !isFinalStatus) {
      return res.status(400).json({ error: 'nextLocation is required' });
    }

    return await sendFileCore(req, res, next, {
      direction: 'forward',
      targetLocation: nextLocation,
      nextStatus,
      notes,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Backtrack a file (return to a previous desk for correction).
 * Uses the unified Send core engine.
 */
export async function backtrackFile(req, res, next) {
  try {
    const {
      returnLocation,
      backtrackReason,
      internalNotes,
    } = req.body;

    if (!returnLocation || !backtrackReason) {
      return res.status(400).json({ error: 'returnLocation and backtrackReason are required' });
    }

    return await sendFileCore(req, res, next, {
      direction: 'backtrack',
      targetLocation: returnLocation,
      backtrackReason,
      internalNotes,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Shared Send core engine for both forward and backtrack actions.
 * Updates currentStatus to 'In Transit' and sets targetLocation.
 * Does NOT update currentLocation or assignedOfficerId (which update only on physical receive).
 */
async function sendFileCore(req, res, next, { direction, targetLocation, nextStatus, notes, backtrackReason, internalNotes }) {
  try {
    const result = await runTransactionalWrite(async (session) => {
      const file = await File.findById(req.params.id).session(session);
      if (!file) {
        throw new Error('File not found');
      }
      if (file.isClosed) {
        throw new Error('File closed');
      }
      if (file.currentStatus === FILE_STATUSES.IN_TRANSIT) {
        throw new Error('File already in transit');
      }

      const previousLocation = file.currentLocation;
      let destinationDesk = targetLocation || file.currentLocation;

      if (direction === 'forward' && nextStatus === FILE_STATUSES.DISPATCHED && !targetLocation) {
        const archiveDesk = await Department.findOne({
          wardCode: file.wardCode,
          isActive: true,
          name: /archive/i,
        })
          .session(session)
          .lean();
        if (archiveDesk) destinationDesk = archiveDesk.name;
      }

      // Determine missing documents from per-document verifications and legacy fields
      const missingList = [];
      if (Array.isArray(file.documentVerifications) && file.documentVerifications.length > 0) {
        file.documentVerifications.forEach((dv) => {
          if (dv.status !== 'verified' || (dv.missingKeywords && dv.missingKeywords.length > 0)) {
            if (dv.documentLabel && !missingList.includes(dv.documentLabel)) {
              missingList.push(dv.documentLabel);
            }
          }
        });
      }
      if (missingList.length === 0) {
        const legacyMissing = file.documentVerification?.missingKeywords || file.documentVerification?.missingDocuments || [];
        missingList.push(...legacyMissing);
      }

      const overrideReason = (req.body.overrideReason || req.body.remarks || '').trim();
      const hasIncompleteDocs = missingList.length > 0 || file.verificationStatus === 'missing-documents';

      // Gate forwarding: block if incomplete, unless officer explicitly provides an override reason
      if (direction === 'forward' && hasIncompleteDocs) {
        if (!overrideReason) {
          throw new Error(`MISSING_DOCS:${missingList.join(', ')}`);
        }
      }

      file.targetLocation = destinationDesk;
      file.currentStatus = FILE_STATUSES.IN_TRANSIT;
      await file.save({ session });

      let logNote = notes || (direction === 'backtrack' ? `Returned for correction: ${backtrackReason}` : `Forwarded to ${destinationDesk}`);
      if (direction === 'forward' && hasIncompleteDocs && overrideReason) {
        logNote = `[FORWARD OVERRIDE - INCOMPLETE DOCS (${missingList.join(', ')})]: ${overrideReason}${notes ? ' — ' + notes : ''}`;
      }

      // Dispatch Log Entry #1 (Send Event)
      const logEntry = await appendMovementLog({
        fileId: file._id,
        officerId: req.user._id,
        actionType: FILE_STATUSES.IN_TRANSIT,
        currentLocation: previousLocation,
        previousLocation,
        nextLocation: destinationDesk,
        notes: logNote,
        backtrackReason: direction === 'backtrack' ? backtrackReason : undefined,
        internalNotes,
        scannedVia: 'manual',
        session,
      });

      return { file, logEntry, destinationDesk };
    });

    // Notify citizen via SMS on status transition
    const smsResult = await sendSmsNotification({
      file: result.file,
      status: FILE_STATUSES.IN_TRANSIT,
      location: result.destinationDesk,
      notes: direction === 'backtrack' ? backtrackReason : notes,
    });

    // Notify citizen via Email on status transition
    const emailResult = await sendEmailNotification({
      file: result.file,
      status: FILE_STATUSES.IN_TRANSIT,
      location: result.destinationDesk,
      notes: direction === 'backtrack' ? backtrackReason : notes,
    });

    return res.json({
      success: true,
      file: {
        id: result.file._id,
        fileUid: result.file.fileUid,
        currentStatus: result.file.currentStatus,
        currentLocation: result.file.currentLocation,
        targetLocation: result.file.targetLocation,
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
    if (err.message?.startsWith('MISSING_DOCS:')) {
      const missingStr = err.message.replace('MISSING_DOCS:', '');
      return res.status(400).json({
        error: `Cannot forward or backtrack file until missing required document(s) are submitted: ${missingStr}. Please resolve missing documents first.`,
        missingDocuments: missingStr.split(', '),
      });
    }
    if (err.message === 'File not found') {
      return res.status(404).json({ error: 'File not found' });
    }
    if (err.message === 'File closed') {
      return res.status(400).json({ error: 'This file is already closed and cannot be sent.' });
    }
    if (err.message === 'File already in transit') {
      return res.status(400).json({ error: 'This file is already in transit to a destination desk.' });
    }
    throw err;
  }
}

/**
 * Resolves missing document requirements for a file after officer inspection or AI scan.
 */
export async function resolveMissingDocuments(req, res, next) {
  try {
    const { documentVerification, documentVerifications, resolvedKeywords = [], notes } = req.body;

    const file = await File.findById(req.params.id);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (Array.isArray(documentVerifications) && documentVerifications.length > 0) {
      file.documentVerifications = documentVerifications.map((dv) => ({
        documentLabel: dv.documentLabel || 'Attachment',
        imagePreview: dv.imagePreview || null,
        // Tier-3 #15: multi-page persistence.
        imagePreviews: Array.isArray(dv.imagePreviews) && dv.imagePreviews.length > 0
          ? dv.imagePreviews.slice(0, 10).map((p) => String(p).slice(0, 2_000_000))
          : (dv.imagePreview ? [String(dv.imagePreview).slice(0, 2_000_000)] : []),
        pages: Array.isArray(dv.pages) ? dv.pages.slice(0, 10).map((p) => ({
          pageIndex: p.pageIndex || 0,
          extractedTextPreview: p.extractedTextPreview || '',
          extractedText: p.extractedText || '',
          completenessScore: p.completenessScore || 0,
          ocrConfidence: p.ocrConfidence || 0,
          imageWidth: p.imageWidth || 0,
          imageHeight: p.imageHeight || 0,
          textBoxes: Array.isArray(p.textBoxes) ? p.textBoxes : [],
        })) : [],
        scannedAt: dv.scannedAt || new Date(),
        detectedType: dv.detectedType || null,
        ocrConfidence: dv.ocrConfidence || 0.9,
        qualityScore: dv.qualityScore || 0.85,
        completenessScore: dv.completenessScore || 1.0,
        detectedLanguage: dv.detectedLanguage || 'np',
        isQualityPassed: dv.isQualityPassed ?? true,
        missingKeywords: dv.missingKeywords || [],
        status: dv.status || 'verified',
        extractedTextPreview: dv.extractedTextPreview || null,
        extractedText: dv.extractedText || null,
        // Tier-3 #12: per-word bounding boxes for the side-by-side review modal.
        textBoxes: Array.isArray(dv.textBoxes) ? dv.textBoxes.slice(0, 200).map((tb) => ({
          text: String(tb.text || ''),
          bbox: Array.isArray(tb.bbox) ? tb.bbox.map((p) => [Number(p[0]) || 0, Number(p[1]) || 0]) : [],
          confidence: typeof tb.confidence === 'number' ? tb.confidence : 0,
        })) : [],
        imageWidth: typeof dv.imageWidth === 'number' ? dv.imageWidth : 0,
        imageHeight: typeof dv.imageHeight === 'number' ? dv.imageHeight : 0,
        imageQualityIssue: dv.imageQualityIssue ? {
          noTextDetected: !!dv.imageQualityIssue.noTextDetected,
          isBlurry: !!dv.imageQualityIssue.isBlurry,
          isDark: !!dv.imageQualityIssue.isDark,
          qualityScore: typeof dv.imageQualityIssue.qualityScore === 'number' ? dv.imageQualityIssue.qualityScore : 0,
          isQualityPassed: dv.imageQualityIssue.isQualityPassed ?? true,
          issueDescription: dv.imageQualityIssue.issueDescription || null,
        } : undefined,
        stampAnalysis: dv.stampAnalysis ? sanitizeStampAnalysis(dv.stampAnalysis) : undefined,
      }));
    }

    const existingVerification = file.documentVerification || {};
    const currentMissing = (file.documentVerifications && file.documentVerifications.length > 0)
      ? file.documentVerifications.filter((dv) => dv.status !== 'verified').map((dv) => dv.documentLabel)
      : (existingVerification.missingKeywords || existingVerification.missingDocuments || []);

    let remainingMissing = [];
    if (resolvedKeywords && resolvedKeywords.length > 0) {
      remainingMissing = currentMissing.filter(
        (kw) => !resolvedKeywords.some((r) => r.toLowerCase().trim() === kw.toLowerCase().trim())
      );
    } else {
      remainingMissing = currentMissing;
    }

    const isFullyResolved = remainingMissing.length === 0;

    file.verificationStatus = isFullyResolved ? 'complete' : 'missing-documents';

    file.documentVerification = {
      ...existingVerification,
      scannedAt: new Date(),
      detectedType: documentVerification?.detectedType || existingVerification.detectedType || file.documentType,
      ocrConfidence: documentVerification?.ocrConfidence ?? existingVerification.ocrConfidence ?? 0.9,
      qualityScore: documentVerification?.qualityScore ?? existingVerification.qualityScore ?? 0.9,
      completenessScore: isFullyResolved ? 1.0 : (documentVerification?.completenessScore ?? existingVerification.completenessScore ?? 0.8),
      detectedLanguage: documentVerification?.detectedLanguage || existingVerification.detectedLanguage || 'np',
      isQualityPassed: isFullyResolved,
      missingKeywords: remainingMissing,
      missingDocuments: remainingMissing,
    };

    await file.save();

    await appendMovementLog({
      fileId: file._id,
      officerId: req.user._id,
      actionType: isFullyResolved ? 'Document Verified' : file.currentStatus,
      currentLocation: file.currentLocation,
      notes: notes || (isFullyResolved ? 'All required physical document(s) verified by officer. Application processing resumed.' : `Updated missing documents checklist. Remaining: ${remainingMissing.join(', ')}`),
    });

    // Notify citizen via Email on resolution of missing documents
    const emailResult = await sendEmailNotification({
      file,
      status: isFullyResolved ? 'Document Verified' : file.currentStatus,
      location: file.currentLocation,
      notes: isFullyResolved ? 'All required physical document(s) have been verified by the office. Your application processing has resumed.' : undefined,
      missingDocuments: remainingMissing,
    });

    const smsResult = await sendSmsNotification({
      file,
      status: isFullyResolved ? 'Document Verified' : file.currentStatus,
      location: file.currentLocation,
      notes: isFullyResolved ? 'All required documents verified. Processing resumed.' : undefined,
    });

    return res.json({
      success: true,
      file,
      remainingMissing,
      isFullyResolved,
      emailNotified: emailResult?.success ?? false,
      smsNotified: smsResult?.success ?? false,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Confirm physical receipt of an in-transit file (QR scan or manual ID confirm).
 * Updates currentLocation and assignedOfficerId to receiving officer/desk.
 */
export async function receiveFile(req, res, next) {
  try {
    const { scannedVia: rawScannedVia, scanned_via, remarks: rawRemarks, manualReason } = req.body;
    const scannedVia = (rawScannedVia || scanned_via || 'manual').toLowerCase();
    const remarks = (rawRemarks || manualReason || '').trim();

    if (scannedVia === 'manual' && !remarks) {
      return res.status(400).json({ error: 'A mandatory reason (e.g. "QR damaged", "Bulk processing") is required for manual entry updates.' });
    }

    const result = await runTransactionalWrite(async (session) => {
      const file = await File.findById(req.params.id).session(session);
      if (!file) {
        throw new Error('File not found');
      }
      if (file.currentStatus !== FILE_STATUSES.IN_TRANSIT) {
        throw new Error('File is not currently in transit');
      }

      // Check latest movement log to determine if direction was backtrack
      const lastLog = await MovementHistory.findOne({ fileId: file._id })
        .sort({ timestamp: -1 })
        .session(session)
        .lean();

      const isBacktrack = Boolean(lastLog && lastLog.backtrackReason);
      const receivingDesk = file.targetLocation || req.user.deskLocation || 'Reception';
      const previousLocation = file.currentLocation;

      // NOW update currentLocation and assignedOfficerId upon physical receipt!
      file.previousLocation = previousLocation;
      file.currentLocation = receivingDesk;
      file.targetLocation = undefined;
      file.assignedOfficerId = req.user._id;
      file.currentStatus = isBacktrack ? FILE_STATUSES.BACKTRACKED : FILE_STATUSES.RECEIVED;
      await file.save({ session });

      // Receipt Log Entry #2 (Receive Event)
      const logEntry = await appendMovementLog({
        fileId: file._id,
        officerId: req.user._id,
        actionType: file.currentStatus,
        currentLocation: receivingDesk,
        previousLocation,
        notes: `Received at ${receivingDesk}`,
        scannedVia,
        remarks: remarks || undefined,
        session,
      });

      return { file, logEntry };
    });

    // Notify citizen via SMS & Email on arrival
    const smsResult = await sendSmsNotification({
      file: result.file,
      status: result.file.currentStatus,
      location: result.file.currentLocation,
    });

    const emailResult = await sendEmailNotification({
      file: result.file,
      status: result.file.currentStatus,
      location: result.file.currentLocation,
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
        scannedVia: result.logEntry.scannedVia,
        remarks: result.logEntry.remarks,
      },
      smsNotified: smsResult?.success ?? false,
      emailNotified: emailResult?.success ?? false,
    });
  } catch (err) {
    if (err.message === 'File not found') {
      return res.status(404).json({ error: 'File not found' });
    }
    if (err.message === 'File is not currently in transit') {
      return res.status(400).json({ error: 'This file is not currently in transit and cannot be received.' });
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
    else if (req.user?.role === 'officer') filter.wardCode = req.user.wardCode;

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
      .select('fileUid trackingId title citizenName currentStatus currentLocation updatedAt documentVerification')
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
 * `scope=desk` narrows to files currently sitting at the officer's own desk;
 * `scope=incoming` returns files currently in transit to the officer's desk.
 */
export async function getOfficerInbox(req, res, next) {
  try {
    const wardCode = req.user.wardCode;
    const { scope = 'ward', limit } = req.query;

    const filter = { wardCode, isClosed: false };
    if (scope === 'desk') {
      filter.currentLocation = req.user.deskLocation;
      filter.currentStatus = { $ne: FILE_STATUSES.IN_TRANSIT };
    } else if (scope === 'incoming') {
      filter.targetLocation = req.user.deskLocation;
      filter.currentStatus = FILE_STATUSES.IN_TRANSIT;
    } else if (scope === 'bell' || scope === 'all_desk') {
      filter.$or = [
        { currentLocation: req.user.deskLocation, currentStatus: { $ne: FILE_STATUSES.IN_TRANSIT } },
        { targetLocation: req.user.deskLocation, currentStatus: FILE_STATUSES.IN_TRANSIT },
      ];
    }

    let query = File.find(filter)
      .select('fileUid trackingId title citizenName currentStatus currentLocation targetLocation updatedAt createdAt documentVerification')
      .sort({ updatedAt: -1 })
      .limit(Math.min(Number(limit) || 200, 200));

    if (scope !== 'desk' && scope !== 'incoming') {
      query = query.populate('assignedOfficerId', 'name deskLocation');
    }

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

/**
 * Tier-3 #13: Re-run OCR on a single persisted `documentVerifications[]` entry.
 *
 * Officers sometimes want to refresh a scan without re-registering the file —
 * e.g. the original photo was blurry, or the AI service has improved and they
 * want the new confidence numbers. This endpoint re-invokes the AI service
 * against the stored `imagePreview` (or a newly-supplied `imageBase64` from
 * the officer's camera), atomically replaces that one entry on the file,
 * recomputes the parent `verificationStatus` + `missingDocuments[]`, and
 * notifies the citizen if anything flipped to verified.
 */
export async function reOcrDocumentVerification(req, res, next) {
  try {
    const { id, idx } = req.params;
    const idxNum = parseInt(idx, 10);
    if (!Number.isInteger(idxNum) || idxNum < 0) {
      return res.status(400).json({ error: 'Invalid documentVerification index' });
    }

    const file = await File.findOne({ _id: id, isDeleted: { $ne: true } });
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    if (!Array.isArray(file.documentVerifications) || idxNum >= file.documentVerifications.length) {
      return res.status(400).json({ error: 'Invalid documentVerification index' });
    }

    const { imageBase64, requiredKeywords, citizenName, citizenNameNepali } = req.body || {};
    const dv = file.documentVerifications[idxNum];

    // Fall back to the stored preview if no new image was supplied.
    const sourceImage = imageBase64 || dv.imagePreview;
    if (!sourceImage) {
      return res.status(400).json({ error: 'No image available for re-OCR (stored preview is missing).' });
    }

    // Re-invoke the AI service. Same call shape as initial registration.
    const result = await aiAnalyzeDocument({
      imageBase64: sourceImage,
      requiredKeywords: Array.isArray(requiredKeywords) && requiredKeywords.length > 0
        ? requiredKeywords
        : (dv.documentLabel ? [dv.documentLabel] : undefined),
      citizenName,
      citizenNameNepali,
    });

    if (result.serviceUnavailable) {
      return res.status(502).json({ error: 'AI service unavailable', details: result });
    }

    const missingKeywords = Array.isArray(result.missingKeywords) ? result.missingKeywords : [];
    const wasVerified = dv.status === 'verified';

    // Atomically replace this entry. Preserve the original label and image so
    // officers see a "refresh of the same scan" rather than a fresh one.
    const previous = dv.toObject ? dv.toObject() : { ...dv };
    file.documentVerifications[idxNum] = {
      ...previous,
      scannedAt: new Date(),
      detectedType: result.documentType || previous.detectedType || null,
      ocrConfidence: typeof result.ocrConfidence === 'number' ? result.ocrConfidence : (previous.ocrConfidence || 0),
      qualityScore: result.imageQualityIssue?.qualityScore ?? previous.qualityScore ?? 0.85,
      completenessScore: typeof result.completenessScore === 'number' ? result.completenessScore : (previous.completenessScore || 0),
      detectedLanguage: result.detectedLanguage || previous.detectedLanguage || 'unknown',
      isQualityPassed: result.imageQualityIssue?.isQualityPassed ?? previous.isQualityPassed ?? true,
      missingKeywords,
      status: missingKeywords.length === 0 ? 'verified' : 'needs_review',
      extractedTextPreview: result.extractedTextPreview || null,
      extractedText: result.extractedText || previous.extractedText || null,
      textBoxes: Array.isArray(result.textBoxes) ? result.textBoxes.slice(0, 200).map((tb) => ({
        text: String(tb.text || ''),
        bbox: Array.isArray(tb.bbox) ? tb.bbox.map((p) => [Number(p[0]) || 0, Number(p[1]) || 0]) : [],
        confidence: typeof tb.confidence === 'number' ? tb.confidence : 0,
      })) : (previous.textBoxes || []),
      imageWidth: typeof result.imageWidth === 'number' ? result.imageWidth : (previous.imageWidth || 0),
      imageHeight: typeof result.imageHeight === 'number' ? result.imageHeight : (previous.imageHeight || 0),
      imageQualityIssue: result.imageQualityIssue || previous.imageQualityIssue,
      stampAnalysis: result.stampAnalysis ? sanitizeStampAnalysis(result.stampAnalysis) : previous.stampAnalysis,
    };

    // Recompute parent-level verificationStatus + missingDocuments.
    const stillMissing = file.documentVerifications
      .filter((entry) => entry.status !== 'verified')
      .map((entry) => entry.documentLabel);
    file.verificationStatus = stillMissing.length === 0 ? 'complete' : 'missing-documents';
    file.missingDocuments = stillMissing;

    await file.save();

    // If a previously-unverified entry just flipped to verified and the file
    // is now fully resolved, tell the citizen.
    if (!wasVerified && file.documentVerifications[idxNum].status === 'verified' && stillMissing.length === 0) {
      try {
        await sendSmsNotification({
          file,
          status: file.currentStatus,
          location: file.currentLocation,
          missingDocuments: stillMissing,
        });
      } catch (smsErr) {
        console.warn('reOcrDocumentVerification: SMS notification failed:', smsErr.message);
      }
    }

    return res.json({
      success: true,
      documentVerification: file.documentVerifications[idxNum],
      verificationStatus: file.verificationStatus,
      missingDocuments: file.missingDocuments,
      reOcrCompletedAt: new Date(),
    });
  } catch (err) {
    next(err);
  }
}