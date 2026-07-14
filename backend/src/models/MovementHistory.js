import mongoose from 'mongoose';

export const ACTION_TYPES = {
  RECEIVED: 'Received',
  PENDING: 'Pending',
  UNDER_REVIEW: 'Under Review',
  APPROVED: 'Approved',
  VERIFIED: 'Verified',
  DISPATCHED: 'Dispatched',
  BACKTRACKED: 'Backtracked',
  RETURNED: 'Returned',
  REJECTED: 'Rejected',
};

const movementHistorySchema = new mongoose.Schema(
  {
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'File',
      required: [true, 'File reference is required'],
      index: true,
    },
    officerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Officer reference is required'],
      index: true,
    },
    actionType: {
      type: String,
      enum: Object.values(ACTION_TYPES),
      required: [true, 'Action type is required'],
      index: true,
    },
    currentLocation: {
      type: String,
      required: [true, 'Current location/desk is required'],
      trim: true,
    },
    previousLocation: {
      type: String,
      trim: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      required: true,
      index: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    internalNotes: {
      type: String,
      select: false, // Internal notes never exposed on public tracking endpoints
      trim: true,
    },
    backtrackReason: {
      type: String,
      trim: true,
    },
    nextLocation: {
      type: String,
      trim: true,
    },
    previousHash: {
      type: String,
      required: [true, 'Previous hash link is required'],
      default: 'GENESIS',
    },
    entryHash: {
      type: String,
      required: [true, 'Entry cryptographic hash is required'],
      index: true,
    },
  },
  {
    timestamps: false, // Disabled since we track timestamp manually as immutable Date
    collection: 'movementhistories',
  }
);

// Indexes for fast history listings and audit checking
movementHistorySchema.index({ fileId: 1, timestamp: -1 });
movementHistorySchema.index({ fileId: 1, entryHash: 1 });
movementHistorySchema.index({ fileId: 1, actionType: 1 });

// Immutable constraints: Throw errors if updates/deletions are attempted at the ORM level
movementHistorySchema.pre('save', function blockDocumentUpdate(next) {
  if (!this.isNew) {
    return next(new Error('MovementHistory is immutable: modification of existing entries is forbidden'));
  }
  next();
});

movementHistorySchema.pre('findOneAndUpdate', function blockUpdate() {
  throw new Error('MovementHistory is immutable: query-level updates are forbidden');
});

movementHistorySchema.pre('updateOne', function blockUpdate() {
  throw new Error('MovementHistory is immutable: query-level updates are forbidden');
});

movementHistorySchema.pre('updateMany', function blockUpdate() {
  throw new Error('MovementHistory is immutable: query-level updates are forbidden');
});

movementHistorySchema.pre('deleteOne', function blockDelete() {
  throw new Error('MovementHistory is immutable: deletions are forbidden');
});

movementHistorySchema.pre('deleteMany', function blockDelete() {
  throw new Error('MovementHistory is immutable: deletions are forbidden');
});

export const MovementHistory = mongoose.model('MovementHistory', movementHistorySchema);
