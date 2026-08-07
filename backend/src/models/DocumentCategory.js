import mongoose from 'mongoose';

const documentCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    typicalDays: {
      type: String,
      default: '3-7',
    },
    deskCount: {
      type: String,
      enum: ['single', 'multi'],
      default: 'multi',
    },
    trackingValue: {
      type: String,
      enum: ['high', 'medium', 'low'],
      default: 'medium',
    },
    requiredChecklist: [
      {
        type: String,
        trim: true,
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export const DocumentCategory = mongoose.model('DocumentCategory', documentCategorySchema);
