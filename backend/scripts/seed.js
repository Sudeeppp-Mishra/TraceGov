import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { User, ROLES } from '../src/models/User.js';
import { Department } from '../src/models/Department.js';

// Load environment configuration
dotenv.config();

const SEED_DEPARTMENTS = [
  { name: 'Reception', code: 'REC', description: 'Reception and physical file intake desk', wardCode: 'W01' },
  { name: 'Verification Desk', code: 'VER', description: 'Document verification and citizen profile matching desk', wardCode: 'W01' },
  { name: 'Ward Chair Section', code: 'WC', description: 'Final endorsement and ward authority section', wardCode: 'W01' },
  { name: 'Tax Office Desk', code: 'TAX', description: 'Municipal revenue collection and tax clearance section', wardCode: 'W01' },
  { name: 'Administrative Archives', code: 'ARC', description: 'Secure long-term document records storage and index archives', wardCode: 'W01' },
  { name: 'Review Panel Office', code: 'REV', description: 'Dispute review and correction advisory panel', wardCode: 'W01' },
  { name: 'Admin Office', code: 'ADM', description: 'Administrative oversight and system configuration desk', wardCode: 'W01' },
];

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
    // Seed Departments
    for (const seedDept of SEED_DEPARTMENTS) {
      const existingDept = await Department.findOne({ code: seedDept.code, wardCode: seedDept.wardCode });
      if (existingDept) {
        console.log(`Seeder: Department skipped (already exists): ${seedDept.code}`);
        continue;
      }
      await Department.create(seedDept);
      console.log(`Seeder: Successfully registered department -> ${seedDept.name} (${seedDept.code})`);
    }

    // Seed Users
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
