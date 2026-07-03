import mongoose from 'mongoose';

const ROLES = ['citizen', 'officer', 'admin'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'officer', index: true },
    wardCode: { type: String, default: 'W01', index: true },
    deskLocation: { type: String, default: 'Reception' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.index({ email: 1 }, { unique: true });

export const User = mongoose.model('User', userSchema);
export { ROLES };
