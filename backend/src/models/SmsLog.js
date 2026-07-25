import mongoose from 'mongoose';

const smsLogSchema = new mongoose.Schema(
  {
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'File',
      required: true,
      index: true,
    },
    fileUid: {
      type: String,
      required: true,
      index: true,
    },
    trackingId: {
      type: String,
      required: true,
      index: true,
    },
    citizenPhone: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    citizenName: {
      type: String,
      required: true,
      trim: true,
    },
    statusTriggered: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
    },
    deliveryStatus: {
      type: String,
      enum: ['sent', 'failed', 'simulated'],
      default: 'simulated',
      index: true,
    },
    provider: {
      type: String,
      default: 'mock',
    },
    errorMessage: {
      type: String,
    },
    sentAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

smsLogSchema.index({ fileId: 1, sentAt: -1 });

export const SmsLog = mongoose.model('SmsLog', smsLogSchema);
