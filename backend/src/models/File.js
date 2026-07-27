import mongoose from 'mongoose';

export const FILE_STATUSES = {
  RECEIVED: 'Received',
  PENDING: 'Pending',
  UNDER_REVIEW: 'Under Review',
  APPROVED: 'Approved',
  VERIFIED: 'Verified',
  DISPATCHED: 'Dispatched',
  BACKTRACKED: 'Backtracked',
  RETURNED: 'Returned',
  REJECTED: 'Rejected',
  IN_TRANSIT: 'In Transit',
};

const fileSchema = new mongoose.Schema(
  {
    fileUid: {
      type: String,
      required: [true, 'File UID is required'],
      unique: true,
      index: true,
      trim: true,
    },
    trackingId: {
      type: String,
      required: [true, 'Tracking ID is required'],
      unique: true,
      index: true,
      trim: true,
    },
    title: {
      type: String,
      required: [true, 'File title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    citizenName: {
      type: String,
      required: [true, 'Citizen name is required'],
      trim: true,
    },
    citizenPhone: {
      type: String,
      required: [true, 'Citizen phone number is required'],
      trim: true,
      match: [/^\d{10}$/, 'Phone number must be exactly 10 digits'],
    },
    citizenEmail: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address'],
    },
    documentType: {
      type: String,
      required: [true, 'Document type is required'],
      trim: true,
    },
    wardCode: {
      type: String,
      required: [true, 'Ward code is required'],
      index: true,
      trim: true,
    },
    currentStatus: {
      type: String,
      enum: Object.values(FILE_STATUSES),
      default: FILE_STATUSES.RECEIVED,
      index: true,
    },
    currentLocation: {
      type: String,
      required: [true, 'Current location/desk is required'],
      default: 'Reception',
      index: true,
      trim: true,
    },
    targetLocation: {
      type: String,
      index: true,
      trim: true,
    },
    assignedOfficerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    qrPayload: {
      type: String,
      required: [true, 'QR code payload string is required'],
    },
    qrDataUrl: {
      type: String, // Base64 Data URL for rendering the QR code directly
    },
    requiredDocuments: [
      {
        type: String,
        trim: true,
      },
    ],
    internalNotes: {
      type: String,
      select: false, // Accessible only when explicitly selected
      trim: true,
    },
    priority: {
      type: Number,
      default: 0, // 0 = Standard, 1 = Medium, 2 = High/Urgent
      index: true,
    },
    isClosed: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes to speed up admin summaries and searches
fileSchema.index({ wardCode: 1, currentStatus: 1, updatedAt: -1 });
fileSchema.index({ citizenName: 'text', title: 'text', fileUid: 'text' });
fileSchema.index({ wardCode: 1, isClosed: 1, currentStatus: 1 });

export const File = mongoose.model('File', fileSchema);
