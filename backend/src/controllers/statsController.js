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