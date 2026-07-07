import mongoose from 'mongoose';

export const ROLES = {
  OFFICER: 'officer',
  ADMIN: 'admin',
};

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false, // Prevents accidental exposure of password hashes
    },
    role: {
      type: String,
      enum: Object.values(ROLES),
      default: ROLES.OFFICER,
      index: true,
    },
    wardCode: {
      type: String,
      required: [true, 'Ward code is required'],
      default: 'W01',
      trim: true,
      index: true,
    },
    deskLocation: {
      type: String,
      required: [true, 'Desk location is required'],
      default: 'Reception',
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Explicit indexing for compound queries if admins lookup active officers by ward
userSchema.index({ wardCode: 1, isActive: 1 });

export const User = mongoose.model('User', userSchema);
