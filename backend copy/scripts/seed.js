import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { User } from '../src/models/User.js';

dotenv.config();

const DEMO_OFFICER = {
  name: 'Demo Officer',
  email: 'officer@ward.gov.np',
  password: 'officer123',
  role: 'officer',
  wardCode: 'W01',
  deskLocation: 'Reception',
};

const DEMO_ADMIN = {
  name: 'Ward Admin',
  email: 'admin@ward.gov.np',
  password: 'admin123',
  role: 'admin',
  wardCode: 'W01',
  deskLocation: 'Admin Office',
};

async function seed() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/tracegov';
  await mongoose.connect(uri);

  for (const demo of [DEMO_OFFICER, DEMO_ADMIN]) {
    const existing = await User.findOne({ email: demo.email });
    if (existing) {
      console.log(`Skipped (exists): ${demo.email}`);
      continue;
    }

    const passwordHash = await bcrypt.hash(demo.password, 12);
    await User.create({ ...demo, passwordHash });
    console.log(`Created: ${demo.email} / ${demo.password}`);
  }

  await mongoose.disconnect();
  console.log('Seed complete.');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
