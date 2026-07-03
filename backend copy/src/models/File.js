import mongoose from 'mongoose';

const FILE_STATUSES = ['Received', 'Pending', 'Approved', 'Dispatched', 'Backtracked'];

const fileSchema = new mongoose.Schema(
  {
    fileUid: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    trackingId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    citizenName: { type: String, required: true, trim: true },
    citizenPhone: { type: String, trim: true },
    documentType: { type: String, required: true, trim: true },
    wardCode: { type: String, required: true, index: true },
    currentStatus: {
      type: String,
      enum: FILE_STATUSES,
      default: 'Received',
      index: true,
    },
    currentLocation: { type: String, required: true, index: true },
    assignedOfficerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    qrPayload: { type: String, required: true },
    qrDataUrl: { type: String },
    requiredDocuments: [{ type: String }],
    internalNotes: { type: String, select: false },
    priority: { type: Number, default: 0, index: true },
    isClosed: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

fileSchema.index({ wardCode: 1, currentStatus: 1, updatedAt: -1 });
fileSchema.index({ citizenName: 'text', title: 'text', fileUid: 'text' });

export const File = mongoose.model('File', fileSchema);
export { FILE_STATUSES };
