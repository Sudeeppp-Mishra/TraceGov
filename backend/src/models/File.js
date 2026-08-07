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
    citizenNameNepali: {
      type: String,
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
    documentVerification: {
      scannedAt: { type: Date },
      detectedType: { type: String },
      ocrConfidence: { type: Number },
      qualityScore: { type: Number },
      completenessScore: { type: Number },
      detectedLanguage: { type: String },
      isQualityPassed: { type: Boolean },
      missingKeywords: [{ type: String }],
      missingDocuments: [{ type: String }],
    },
    documentVerifications: [
      {
        documentLabel: { type: String, required: true },
        imagePreview: { type: String },
        scannedAt: { type: Date, default: Date.now },
        detectedType: { type: String },
        ocrConfidence: { type: Number },
        qualityScore: { type: Number },
        completenessScore: { type: Number },
        detectedLanguage: { type: String },
        isQualityPassed: { type: Boolean },
        missingKeywords: [{ type: String }],
        status: {
          type: String,
          enum: ['not_uploaded', 'verified', 'needs_review', 'unverified'],
          default: 'unverified',
        },
extractedTextPreview: { type: String },
        extractedText: { type: String },
        // Per-language partitions of `extractedText` so the frontend can
        // render two labeled blocks ("🇳🇵 Nepali" / "🇬🇧 English") in the
        // extracted-text modal. Empty strings for single-language docs.
        nepaliText: { type: String },
        englishText: { type: String },
        textBoxes: [{
          text: { type: String },
          bbox: { type: [[Number]] },
          confidence: { type: Number },
          // Per-word script tag from AI service (`ne` / `en` / `mixed` /
          // `unknown`). Drives the language emoji in ScanReviewModal overlays.
          language: { type: String, enum: ['ne', 'en', 'mixed', 'unknown'] },
        }],
        imageWidth: { type: Number },
        imageHeight: { type: Number },
        imagePreviews: [{ type: String }],
        // Tier-3 #17: preprocessed image data URL so the OCR review modal
        // can render bboxes in their true coordinate space even when the
        // scan was persisted days ago (bboxes are in preprocessed pixels,
        // not original-upload pixels). Optional — fall back to imagePreview.
        preprocessedImageDataUrl: { type: String },
        pages: [{
          pageIndex: { type: Number },
          extractedTextPreview: { type: String },
          completenessScore: { type: Number },
          ocrConfidence: { type: Number },
        }],
        imageQualityIssue: {
          noTextDetected: { type: Boolean },
          isBlurry: { type: Boolean },
          isDark: { type: Boolean },
          qualityScore: { type: Number },
          isQualityPassed: { type: Boolean },
          issueDescription: { type: String },
        },
        stampAnalysis: {
          stampDetected: { type: Boolean },
          stampColor: { type: String },
          stampConfidence: { type: Number },
          stampCount: { type: Number },
          stampRegions: [{
            area: { type: Number },
            circularity: { type: Number },
            boundingBox: {
              x: { type: Number },
              y: { type: Number },
              w: { type: Number },
              h: { type: Number },
            },
          }],
        },
        nameVerification: {
          nameFound: { type: Boolean },
          matchedName: { type: String },
          matchConfidence: { type: Number },
          matchType: { type: String, enum: ['exact', 'fuzzy', 'devanagari', 'not_found'] },
        },
      },
    ],
    verificationStatus: {
      type: String,
      enum: ['complete', 'missing-documents', 'needs-correction', 'unverified'],
      default: 'unverified',
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
