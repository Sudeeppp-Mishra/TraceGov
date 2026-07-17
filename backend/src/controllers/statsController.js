import { File } from '../models/File.js';
import { MovementHistory } from '../models/MovementHistory.js';

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

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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