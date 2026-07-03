import mongoose from 'mongoose';

const ACTION_TYPES = ['Received', 'Pending', 'Approved', 'Dispatched', 'Backtracked'];

/**
 * Immutable audit log — append-only with hash chain for tamper evidence.
 * Updates and deletes are blocked at the schema middleware level.
 */
const movementHistorySchema = new mongoose.Schema(
  {
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'File',
      required: true,
      index: true,
    },
    officerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    actionType: {
      type: String,
      enum: ACTION_TYPES,
      required: true,
      index: true,
    },
    currentLocation: { type: String, required: true },
    previousLocation: { type: String },
    timestamp: {
      type: Date,
      default: Date.now,
      required: true,
      index: true,
    },
    notes: { type: String, trim: true },
    /** Internal-only notes — never exposed on citizen tracking endpoint */
    internalNotes: { type: String, select: false },
    backtrackReason: { type: String },
    nextLocation: { type: String },
    previousHash: { type: String, required: true, default: 'GENESIS' },
    entryHash: { type: String, required: true, index: true },
  },
  {
    timestamps: false,
    collection: 'movementhistories',
  }
);

movementHistorySchema.index({ fileId: 1, timestamp: -1 });
movementHistorySchema.index({ fileId: 1, entryHash: 1 });

movementHistorySchema.pre('findOneAndUpdate', function blockUpdate() {
  throw new Error('MovementHistory is immutable — updates are not permitted');
});

movementHistorySchema.pre('updateOne', function blockUpdate() {
  throw new Error('MovementHistory is immutable — updates are not permitted');
});

movementHistorySchema.pre('deleteOne', function blockDelete() {
  throw new Error('MovementHistory is immutable — deletes are not permitted');
});

export const MovementHistory = mongoose.model('MovementHistory', movementHistorySchema);
export { ACTION_TYPES };
