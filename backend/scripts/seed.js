import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { User, ROLES } from '../src/models/User.js';

// Load environment configuration
dotenv.config();

const SEED_USERS = [
  {
    name: 'Demo Officer',
    email: 'officer@ward.gov.np',
    password: 'officer123',
    role: ROLES.OFFICER,
    wardCode: 'W01',
    deskLocation: 'Reception',
  },
  {
    name: 'Ward Admin',
    email: 'admin@ward.gov.np',
    password: 'admin123',
    role: ROLES.ADMIN,
    wardCode: 'W01',
    deskLocation: 'Admin Office',
  },
];

async function seedDatabase() {
  console.log('Seeder: Initializing database seeding operations...');
  
  // Connect to MongoDB
  await connectDatabase();

  try {
    for (const seedUser of SEED_USERS) {
      const emailLower = seedUser.email.toLowerCase();
      const existingUser = await User.findOne({ email: emailLower });

      if (existingUser) {
        console.log(`Seeder: Account skipped (already exists): ${emailLower}`);
        continue;
      }

      // Hash password and save user
      const passwordHash = await bcrypt.hash(seedUser.password, 12);
      
      const { password, ...userFields } = seedUser;
      await User.create({
        ...userFields,
        email: emailLower,
        passwordHash,
      });

      console.log(`Seeder: Successfully registered account -> ${emailLower} | password: ${password}`);
    }

    console.log('Seeder: Database seeding operations completed successfully.');
  } catch (err) {
    console.error(`Seeder: Error during execution: ${err.message}`);
  } finally {
    // Terminate Mongoose connection gracefully
    await disconnectDatabase();
  }
}

seedDatabase().catch((err) => {
  console.error('Seeder: Critical failure encountered:', err);
  process.exit(1);
});
