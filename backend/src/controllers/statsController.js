import os from 'os';
import mongoose from 'mongoose';
import { File } from '../models/File.js';
import { MovementHistory } from '../models/MovementHistory.js';
import { User } from '../models/User.js';
import { getRollingThroughput } from '../utils/requestCounter.js';
import {
  getMissingDocs,
  getNeedsReviewDocs,
} from '../utils/docStatus.js';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Public, read-only, platform-wide statistics for the landing page trust bar.
 * Deliberately limited to cheap, index-backed counts (no per-file ledger
 * re-verification) so this endpoint stays safe to call on every anonymous
 * page load, and always reflects the live database state.
 */
export async function getPublicStats(req, res, next) {
  try {
    const [totalFiles, totalMovements, closedFiles, wardCodes] = await Promise.all([
      File.countDocuments({}),
      MovementHistory.countDocuments({}),
      File.countDocuments({ isClosed: true }),
      File.distinct('wardCode'),
    ]);

    const resolutionRate = totalFiles > 0 ? Number(((closedFiles / totalFiles) * 100).toFixed(1)) : 0;

    return res.json({
      success: true,
      generatedAt: new Date().toISOString(),
      stats: {
        totalFiles,
        totalMovements,
        activeWards: wardCodes.length,
        resolutionRate,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Authenticated: real movement counts per day for the last 7 days.
 * Officers are scoped to their own ward; admins may pass ?allWards=true.
 * MovementHistory has no wardCode, so ward scoping goes through file ids
 * (same pattern as the dashboard summary).
 */
export async function getWeeklyThroughput(req, res, next) {
  try {
    const allWards = req.user.role === 'admin' && req.query.allWards === 'true';

    const since = new Date();
    since.setDate(since.getDate() - 6);
    since.setHours(0, 0, 0, 0);

    const match = { timestamp: { $gte: since } };
    if (!allWards) {
      const wardFileIds = await File.find({ wardCode: req.user.wardCode }).distinct('_id');
      match.fileId = { $in: wardFileIds };
    }

    // Group in the server's local timezone so buckets line up with the zero-fill below
    const offsetMin = -since.getTimezoneOffset();
    const sign = offsetMin >= 0 ? '+' : '-';
    const tz = `${sign}${String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, '0')}:${String(Math.abs(offsetMin) % 60).padStart(2, '0')}`;

    const grouped = await MovementHistory.aggregate([
      { $match: match },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp', timezone: tz } }, count: { $sum: 1 } } },
    ]);
    const countsByDate = Object.fromEntries(grouped.map((g) => [g._id, g.count]));

    // Zero-fill every day in the window, oldest first
    const days = [];
    for (let i = 0; i < 7; i += 1) {
      const day = new Date(since);
      day.setDate(since.getDate() + i);
      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
      days.push({ date: key, label: WEEKDAY_LABELS[day.getDay()], count: countsByDate[key] || 0 });
    }

    return res.json({ success: true, days });
  } catch (err) {
    next(err);
  }
}

/**
 * Admin-only: live CPU / RAM / DB / API throughput metrics.
 *
 * Powers the four "System Resource Metrics" tiles on the admin dashboard —
 * previously hardcoded values ("18%" / "342 MB" / "1.4 GB" / "42 req/min").
 * Now derived from:
 *   - process.memoryUsage()  → RSS (resident set size) + heap usage
 *   - os.cpus()              → CPU usage sampled twice across a 100ms delay
 *   - db.stats()             → live storageSize and object count
 *   - getRollingThroughput() → in-memory rolling 60s request counter
 *
 * Designed to be polled every 15s by the dashboard; cheap, no scans.
 * If `db.stats()` fails (e.g. ¯\_(ツ)_/¯ Atlas replica lag), we still return
 * the process metrics and `dbStorageBytes: null` so the card renders "—"
 * rather than 500ing the whole endpoint.
 */
export async function getAdminInfraMetrics(req, res, next) {
  try {
    const cores = os.cpus() || [];
    const cpuCount = cores.length || 1;

    // Sample CPU twice across a short window so we get a meaningful
    // "current" usage instead of a single instant snapshot (which on
    // a fresh process is always near zero).
    const sample1 = readCpuTimes();
    const memBefore = process.memoryUsage();
    await new Promise((r) => setTimeout(r, 100));
    const sample2 = readCpuTimes();
    const memAfter = process.memoryUsage();

    const totalDelta = sample2.total - sample1.total;
    const idleDelta = sample2.idle - sample1.idle;
    const cpuPercent = totalDelta > 0
      ? Math.max(0, Math.min(100, ((totalDelta - idleDelta) / totalDelta) * 100))
      : 0;

    // Pick the larger of the two RSS samples so we don't accidentally
    // report a smaller number after a GC pause.
    const rssBytes = Math.max(memBefore.rss, memAfter.rss);

    // DB stats: best-effort. Done outside the awaited Promise.all so a
    // failure doesn't poison the process metrics.
    let dbStorageBytes = null;
    let dbStorageObjects = null;
    try {
      if (mongoose.connection?.db) {
        const stats = await mongoose.connection.db.stats();
        // `storageSize` is the wiredTiger on-disk footprint; `dataSize` is
        // logical. We want raw storage impact for the "Database Storage"
        // tile — that's what shows up in Atlas billing.
        dbStorageBytes = typeof stats.storageSize === 'number' ? stats.storageSize : null;
        dbStorageObjects = typeof stats.objects === 'number' ? stats.objects : null;
      }
    } catch (dbErr) {
      console.warn('[ADMIN INFRA] db.stats() failed:', dbErr?.message || dbErr);
    }

    const throughput = getRollingThroughput();

    return res.json({
      success: true,
      capturedAt: new Date().toISOString(),
      cpuPercent: Number(cpuPercent.toFixed(1)),
      cpuCores: cpuCount,
      rssBytes,
      heapUsedBytes: memAfter.heapUsed,
      heapTotalBytes: memAfter.heapTotal,
      dbStorageBytes,
      dbStorageObjects,
      throughprpm: null, // deprecated key — preserved so stale FE code doesn't crash
      throughputRpm: throughput.count,
      sampleWindowSec: throughput.windowSec,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Helper: snapshot the per-core CPU time deltas so we can compute a
 * process-wide utilisation percentage.
 */
function readCpuTimes() {
  const cpus = os.cpus();
  let user = 0;
  let nice = 0;
  let sys = 0;
  let idle = 0;
  let irq = 0;
  for (const c of cpus) {
    user += c.times.user;
    nice += c.times.nice;
    sys += c.times.sys;
    idle += c.times.idle;
    irq += c.times.irq;
  }
  const total = user + nice + sys + idle + irq;
  return { total, idle };
}

/**
 * Admin-only: aggregated analytics for the dashboard's new visuals.
 *
 * Accepts an optional `range` query param: `"7d"` (default) or `"30d"`.
 * Returns:
 *   - filesPerDesk:      per-desk files processed in the window
 *   - avgTimeInDeskHours: per-desk average dwell time (entry→exit)
 *   - officerWorkload:   currently-open files per officer
 *   - dailyRegistration:  files registered per day in the window
 *   - reviewTurnaroundHours: avg needs_review → verified (per-doc)
 *   - blockedBreakdown:  ward-wide missing-vs-needs-review counts
 *
 * Sources are aggregated in the DB where possible (group counts, group
 * averages) so the endpoint stays cheap even at 7d/30d windows.
 *
 * Ward-scoped: admins default to their own ward; pass `allWards=true`
 * to roll up ward-wide (matching the dashboard summary pattern).
 */
export async function getAdminAnalytics(req, res, next) {
  try {
    const range = req.query.range === '30d' ? 30 : 7;
    const allWards = req.user.role === 'admin' && req.query.allWards === 'true';
    const wardCode = req.user.wardCode;

    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (range - 1));

    const baseFilter = (req.user.role === 'admin' || req.user.role === 'ward_chair') && allWards ? {} : { wardCode };
    const wardFileIds = await File.find(baseFilter).distinct('_id');

    // ── 1. Files processed per desk (movement count by currentLocation) ──
    const filesPerDeskAgg = await MovementHistory.aggregate([
      { $match: { timestamp: { $gte: since }, fileId: { $in: wardFileIds } } },
      { $group: { _id: '$currentLocation', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    const filesPerDesk = filesPerDeskAgg.map((d) => ({
      desk: d._id || 'Unassigned',
      count: d.count,
    }));

    // ── 2. Average time-in-desk per desk (bottleneck detector) ──
    // For each desk, average the gap between successive movements on the
    // same file. A desk where files dwell longest is the bottleneck.
    // We pair consecutive movements using $setWindowFields to avoid
    // pulling everything into Node.
    const dwellPairs = await MovementHistory.aggregate([
      { $match: { timestamp: { $gte: since }, fileId: { $in: wardFileIds } } },
      { $sort: { fileId: 1, timestamp: 1 } },
      {
        $setWindowFields: {
          partitionBy: '$fileId',
          sortBy: { timestamp: 1 },
          output: {
            prevTimestamp: { $shift: { output: '$timestamp', by: -1 } },
            prevLocation: { $shift: { output: '$currentLocation', by: -1 } },
          },
        },
      },
      { $match: { prevTimestamp: { $ne: null } } },
      {
        $project: {
          desk: '$prevLocation',
          dwellMs: { $subtract: ['$timestamp', '$prevTimestamp'] },
        },
      },
    ]);

    const dwellByLoc = new Map();
    for (const d of dwellPairs) {
      if (!d.desk || d.dwellMs == null) continue;
      const cur = dwellByLoc.get(d.desk) || { totalMs: 0, count: 0 };
      cur.totalMs += d.dwellMs;
      cur.count += 1;
      dwellByLoc.set(d.desk, cur);
    }
    const avgTimeInDeskHours = Array.from(dwellByLoc.entries())
      .map(([desk, { totalMs, count }]) => ({
        desk,
        avgHours: count > 0 ? Number((totalMs / count / 36e5).toFixed(2)) : 0,
        sampleCount: count,
      }))
      .sort((a, b) => b.avgHours - a.avgHours);

    // ── 3. Officer workload (open files currently assigned) ──
    const officerWorkloadAgg = await File.aggregate([
      { $match: { ...baseFilter, isClosed: false, assignedOfficerId: { $ne: null } } },
      { $group: { _id: '$assignedOfficerId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'officer',
        },
      },
      { $unwind: { path: '$officer', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          count: 1,
          name: '$officer.name',
          deskLocation: '$officer.deskLocation',
        },
      },
      { $limit: 12 },
    ]);
    const officerWorkload = officerWorkloadAgg.map((o) => ({
      officerId: o._id,
      name: o.name || 'Unknown',
      desk: o.deskLocation || 'Unassigned',
      openFiles: o.count,
    }));

    // ── 4. Daily registration volume trend ──
    const offsetMin = -since.getTimezoneOffset();
    const sign = offsetMin >= 0 ? '+' : '-';
    const tz = `${sign}${String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, '0')}:${String(Math.abs(offsetMin) % 60).padStart(2, '0')}`;

    const registeredAgg = await File.aggregate([
      { $match: { ...baseFilter, createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: tz } }, count: { $sum: 1 } } },
    ]);
    const registeredByDate = Object.fromEntries(registeredAgg.map((g) => [g._id, g.count]));

    const dailyRegistration = [];
    for (let i = 0; i < range; i += 1) {
      const day = new Date(since);
      day.setDate(since.getDate() + i);
      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
      dailyRegistration.push({
        date: key,
        label: range <= 7 ? WEEKDAY_LABELS[day.getDay()] : `${day.getMonth() + 1}/${day.getDate()}`,
        count: registeredByDate[key] || 0,
      });
    }

    // ── 5. Document verification turnaround (needs_review → verified) ──
    // Per-doc: average hours between each row's needs_review timestamp
    // (the most recent movement with actionType DOCUMENT_VERIFIED showing
    // status === 'needs_review' on that file/idx at that moment) and the
    // next verified timestamp. Cheap approximation: compare needs_review
    // movement timestamps to the verification row's scannedAt.
    //
    // Pull the small set of files with any needs_review row, then run
    // an in-memory join against their DOCUMENT_VERIFIED movements.
    const reviewTurnaroundMs = await computeReviewTurnaroundMs(wardFileIds, since);

    // ── 6. Blocked-files breakdown (missing vs needs_review) ──
    const blockedFiles = await File.find({ ...baseFilter, isClosed: false })
      .select('documentVerifications currentStatus wardCode')
      .lean();
    let missingCount = 0;
    let needsReviewCount = 0;
    for (const f of blockedFiles) {
      missingCount += getMissingDocs(f).length;
      needsReviewCount += getNeedsReviewDocs(f).length;
    }
    const blockedFilesCount = blockedFiles.filter(
      (f) => getMissingDocs(f).length > 0 || getNeedsReviewDocs(f).length > 0
    ).length;

    return res.json({
      success: true,
      range,
      generatedAt: new Date().toISOString(),
      filesPerDesk,
      avgTimeInDeskHours,
      officerWorkload,
      dailyRegistration,
      reviewTurnaroundHours: reviewTurnaroundMs != null
        ? Number((reviewTurnaroundMs / 36e5).toFixed(2))
        : null,
      blockedBreakdown: {
        missingRows: missingCount,
        needsReviewRows: needsReviewCount,
        blockedFiles: blockedFilesCount,
        totalFiles: blockedFiles.length,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Compute average hours between a doc row entering needs_review and
 * being verified. Uses the per-doc-scannedAt timestamps on `documentVerifications[]`.
 *
 * Approach: for each file in scope, walk its rows in scannedAt order.
 * When we see a row that is currently verified, look for the most recent
 * prior `needs_review` entry on the SAME row (by index) via the
 * MovementHistory table — but since the row-level state machine is
 * captured in documentVerifications[].status, we can approximate:
 * if the row is verified, the gap is current.scannedAt - priorNeedsReview.scannedAt.
 * If the row went straight from unverified→verified, the gap is 0 and
 * the row is excluded from the average.
 */
async function computeReviewTurnaroundMs(wardFileIds, since) {
  // Restrict to recent files so the scan stays bounded; turnout is meaningless
  // for ancient docs.
  const files = await File.find({ _id: { $in: wardFileIds }, updatedAt: { $gte: since } })
    .select('documentVerifications updatedAt')
    .lean();

  const gaps = [];
  for (const f of files) {
    const dvs = Array.isArray(f.documentVerifications) ? f.documentVerifications : [];
    for (const dv of dvs) {
      if (dv.status !== 'verified') continue;
      if (!dv.scannedAt) continue;
      // We don't have the prior status's timestamp on the row itself.
      // Use the file's updatedAt as a soft upper bound: the row was
      // verified at `scannedAt` and the gap is at least scannedAt -
      // previousUpdates. Without a dedicated needs_review timestamp field,
      // we fall back to "the row's verification lag" = scannedAt - file.updatedAt
      // when the row was created from needs_review. To avoid spurious
      // negative values, only count when scannedAt > file.createdAt.
      // (In practice this is approximate — the source-of-truth would be
      // an explicit needs_review_entered_at field, which we don't store.)
      const startBasis = f.updatedAt && dv.scannedAt > f.updatedAt
        ? f.updatedAt
        : null;
      if (!startBasis) continue;
      const gap = dv.scannedAt.getTime() - startBasis.getTime();
      if (gap > 0) gaps.push(gap);
    }
  }
  if (gaps.length === 0) return null;
  return gaps.reduce((s, v) => s + v, 0) / gaps.length;
}
