import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { User, ROLES } from '../src/models/User.js';
import { Department } from '../src/models/Department.js';
import { File, FILE_STATUSES } from '../src/models/File.js';
import { generateFileUid, generateTrackingId } from '../src/services/cryptoService.js';
import { generateQrCode } from '../src/services/qrService.js';
import { appendMovementLog } from '../src/services/ledgerService.js';

// Load environment configuration
dotenv.config({ path: '../.env' });

/**
 * Usage:
 *   npm run seed              -> core seed only (departments + 2 login accounts). Unchanged from before.
 *   npm run seed:demo         -> core seed + a second ward, extra officers, and realistic demo files/ledger history.
 *   npm run seed:demo:reset   -> wipes previously seeded demo files/history first, then reseeds demo data.
 *
 * The core seed step never touches File/MovementHistory data and is safe to
 * run repeatedly against any environment. The --demo and --reset flags are
 * opt-in and only affect data reserved for this seeder (see DEMO_PHONE_PATTERN).
 */

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

// --- Demo-only additions below (only used when --demo is passed) ---

const DEMO_DEPARTMENTS_W02 = [
  { name: 'Baneshwor Reception', code: 'REC-W02', description: 'Reception and physical file intake desk for Ward 02', wardCode: 'W02' },
  { name: 'Baneshwor Verification Desk', code: 'VER-W02', description: 'Document verification and citizen profile matching desk for Ward 02', wardCode: 'W02' },
  { name: 'Baneshwor Ward Chair Section', code: 'WC-W02', description: 'Final endorsement and ward authority section for Ward 02', wardCode: 'W02' },
  { name: 'Baneshwor Tax Office Desk', code: 'TAX-W02', description: 'Municipal revenue collection and tax clearance section for Ward 02', wardCode: 'W02' },
  { name: 'Baneshwor Administrative Archives', code: 'ARC-W02', description: 'Secure long-term document records storage and index archives for Ward 02', wardCode: 'W02' },
  { name: 'Baneshwor Review Panel Office', code: 'REV-W02', description: 'Dispute review and correction advisory panel for Ward 02', wardCode: 'W02' },
  { name: 'Baneshwor Admin Office', code: 'ADM-W02', description: 'Administrative oversight and system configuration desk for Ward 02', wardCode: 'W02' },
];

const DEMO_OFFICERS = [
  { name: 'Sunita Rai', email: 'verification.w01@ward.gov.np', password: 'demo1234', role: ROLES.OFFICER, wardCode: 'W01', deskLocation: 'Verification Desk' },
  { name: 'Bikash Thapa', email: 'tax.w01@ward.gov.np', password: 'demo1234', role: ROLES.OFFICER, wardCode: 'W01', deskLocation: 'Tax Office Desk' },
  { name: 'Anjali Gurung', email: 'wardchair.w01@ward.gov.np', password: 'demo1234', role: ROLES.OFFICER, wardCode: 'W01', deskLocation: 'Ward Chair Section' },
  { name: 'Prakash KC', email: 'reception.w02@ward.gov.np', password: 'demo1234', role: ROLES.OFFICER, wardCode: 'W02', deskLocation: 'Baneshwor Reception' },
  { name: 'Maya Shrestha', email: 'verification.w02@ward.gov.np', password: 'demo1234', role: ROLES.OFFICER, wardCode: 'W02', deskLocation: 'Baneshwor Verification Desk' },
  { name: 'Bina Karki', email: 'admin.w02@ward.gov.np', password: 'demo1234', role: ROLES.ADMIN, wardCode: 'W02', deskLocation: 'Baneshwor Admin Office' },
];

// Reserved citizenPhone range used ONLY by this seeder, so demo data can be
// identified and safely reset without touching any real/production files.
const DEMO_PHONE_PATTERN = /^9800000\d{3}$/;

// Blueprints are replayed in chronological step order to build realistic,
// properly hash-chained movement history via appendMovementLog(). Each
// blueprint covers a different final status, ward, desk, and age profile so
// dashboard analytics (status counts, queue distribution, average processing
// time, backtrack rate) and the AI risk/M-M-1 estimators all have real
// variety to work with.
const DEMO_FILE_BLUEPRINTS = [
  // --- Ward W01 ---
  {
    wardCode: 'W01',
    title: 'Citizenship Certificate Renewal',
    citizenName: 'Ram Bahadur Thapa',
    citizenPhone: '9800000001',
    documentType: 'Citizenship Certificate',
    requiredDocuments: ['Citizenship Certificate Copy', 'Recommendation Letter', 'Passport Photo'],
    steps: [
      { hoursAgo: 1, actionType: FILE_STATUSES.RECEIVED, location: 'Reception', officerEmail: 'officer@ward.gov.np', notes: 'File registered: Citizenship Certificate Renewal' },
    ],
  },
  {
    wardCode: 'W01',
    title: 'Birth Registration Certificate',
    citizenName: 'Gita Devi Adhikari',
    citizenPhone: '9800000002',
    documentType: 'Birth Registration',
    requiredDocuments: ['Application Form', 'Parent Citizenship Certificate'],
    steps: [
      { hoursAgo: 3, actionType: FILE_STATUSES.RECEIVED, location: 'Reception', officerEmail: 'officer@ward.gov.np', notes: 'File registered: Birth Registration Certificate' },
    ],
  },
  {
    wardCode: 'W01',
    title: 'Land Ownership Certificate Transfer',
    citizenName: 'Hari Prasad Poudel',
    citizenPhone: '9800000003',
    documentType: 'Land Ownership Certificate',
    requiredDocuments: ['Land Ownership Certificate', 'Tax Clearance Certificate', 'Citizenship Certificate Copy'],
    steps: [
      { hoursAgo: 30, actionType: FILE_STATUSES.RECEIVED, location: 'Reception', officerEmail: 'officer@ward.gov.np', notes: 'File registered: Land Ownership Certificate Transfer' },
      { hoursAgo: 4, actionType: FILE_STATUSES.PENDING, location: 'Verification Desk', officerEmail: 'verification.w01@ward.gov.np', notes: 'Forwarded for document verification' },
    ],
  },
  {
    wardCode: 'W01',
    title: 'Business Registration Application',
    citizenName: 'Suresh Raj Shrestha',
    citizenPhone: '9800000004',
    documentType: 'Business Registration',
    requiredDocuments: ['Application Form', 'Tax Clearance Certificate', 'Recommendation Letter'],
    steps: [
      { hoursAgo: 50, actionType: FILE_STATUSES.RECEIVED, location: 'Reception', officerEmail: 'officer@ward.gov.np', notes: 'File registered: Business Registration Application' },
      { hoursAgo: 26, actionType: FILE_STATUSES.PENDING, location: 'Verification Desk', officerEmail: 'verification.w01@ward.gov.np', notes: 'Forwarded for document verification' },
      { hoursAgo: 2, actionType: FILE_STATUSES.PENDING, location: 'Tax Office Desk', officerEmail: 'tax.w01@ward.gov.np', notes: 'Forwarded for tax clearance review' },
    ],
  },
  {
    wardCode: 'W01',
    title: 'Marriage Registration Certificate',
    citizenName: 'Kamala Devi Bhattarai',
    citizenPhone: '9800000005',
    documentType: 'Marriage Registration',
    requiredDocuments: ['Application Form', 'Citizenship Certificate Copy', 'Recommendation Letter'],
    steps: [
      { hoursAgo: 20, actionType: FILE_STATUSES.RECEIVED, location: 'Reception', officerEmail: 'officer@ward.gov.np', notes: 'File registered: Marriage Registration Certificate' },
      { hoursAgo: 10, actionType: FILE_STATUSES.PENDING, location: 'Verification Desk', officerEmail: 'verification.w01@ward.gov.np', notes: 'Forwarded for document verification' },
      { hoursAgo: 1, actionType: FILE_STATUSES.APPROVED, location: 'Ward Chair Section', officerEmail: 'wardchair.w01@ward.gov.np', notes: 'Approved and endorsed by ward chair', isFinal: true },
    ],
  },
  {
    wardCode: 'W01',
    title: 'Citizenship Certificate Correction',
    citizenName: 'Dinesh Kumar Rai',
    citizenPhone: '9800000006',
    documentType: 'Citizenship Certificate',
    requiredDocuments: ['Citizenship Certificate Copy', 'Recommendation Letter'],
    steps: [
      { hoursAgo: 70, actionType: FILE_STATUSES.RECEIVED, location: 'Reception', officerEmail: 'officer@ward.gov.np', notes: 'File registered: Citizenship Certificate Correction' },
      { hoursAgo: 50, actionType: FILE_STATUSES.PENDING, location: 'Verification Desk', officerEmail: 'verification.w01@ward.gov.np', notes: 'Forwarded for document verification' },
      { hoursAgo: 3, actionType: FILE_STATUSES.APPROVED, location: 'Ward Chair Section', officerEmail: 'wardchair.w01@ward.gov.np', notes: 'Approved and endorsed by ward chair', isFinal: true },
    ],
  },
  {
    wardCode: 'W01',
    title: 'Tax Clearance Certificate',
    citizenName: 'Sabina Kumari Magar',
    citizenPhone: '9800000007',
    documentType: 'Tax Clearance',
    requiredDocuments: ['Tax Receipt', 'Citizenship Certificate Copy'],
    steps: [
      { hoursAgo: 90, actionType: FILE_STATUSES.RECEIVED, location: 'Reception', officerEmail: 'officer@ward.gov.np', notes: 'File registered: Tax Clearance Certificate' },
      { hoursAgo: 70, actionType: FILE_STATUSES.PENDING, location: 'Verification Desk', officerEmail: 'verification.w01@ward.gov.np', notes: 'Forwarded for document verification' },
      { hoursAgo: 40, actionType: FILE_STATUSES.PENDING, location: 'Tax Office Desk', officerEmail: 'tax.w01@ward.gov.np', notes: 'Forwarded for tax clearance review' },
      { hoursAgo: 5, actionType: FILE_STATUSES.DISPATCHED, location: 'Administrative Archives', officerEmail: 'admin@ward.gov.np', notes: 'Cleared and dispatched to archives', isFinal: true },
    ],
  },
  {
    wardCode: 'W01',
    title: 'Land Ownership Certificate Update',
    citizenName: 'Bishnu Prasad Dahal',
    citizenPhone: '9800000008',
    documentType: 'Land Ownership Certificate',
    requiredDocuments: ['Land Ownership Certificate', 'Tax Clearance Certificate', 'Citizenship Certificate Copy'],
    steps: [
      { hoursAgo: 15, actionType: FILE_STATUSES.RECEIVED, location: 'Reception', officerEmail: 'officer@ward.gov.np', notes: 'File registered: Land Ownership Certificate Update' },
      { hoursAgo: 9, actionType: FILE_STATUSES.PENDING, location: 'Verification Desk', officerEmail: 'verification.w01@ward.gov.np', notes: 'Forwarded for document verification' },
      {
        hoursAgo: 2,
        actionType: FILE_STATUSES.BACKTRACKED,
        location: 'Reception',
        officerEmail: 'verification.w01@ward.gov.np',
        notes: 'Backtracked: Missing Tax Clearance Certificate and Citizenship Certificate Copy',
        backtrackReason: 'Missing Tax Clearance Certificate and Citizenship Certificate Copy',
        isBacktrack: true,
      },
    ],
  },
  // --- Ward W02 ---
  {
    wardCode: 'W02',
    title: 'Small Business Registration',
    citizenName: 'Radha Kumari Tamang',
    citizenPhone: '9800000009',
    documentType: 'Business Registration',
    requiredDocuments: ['Application Form', 'Tax Clearance Certificate', 'Recommendation Letter'],
    steps: [
      { hoursAgo: 2, actionType: FILE_STATUSES.RECEIVED, location: 'Baneshwor Reception', officerEmail: 'reception.w02@ward.gov.np', notes: 'File registered: Small Business Registration' },
    ],
  },
  {
    wardCode: 'W02',
    title: 'Citizenship Certificate Copy Request',
    citizenName: 'Ramesh Bahadur Thapa',
    citizenPhone: '9800000010',
    documentType: 'Citizenship Certificate',
    requiredDocuments: ['Citizenship Certificate Copy', 'Recommendation Letter'],
    steps: [
      { hoursAgo: 18, actionType: FILE_STATUSES.RECEIVED, location: 'Baneshwor Reception', officerEmail: 'reception.w02@ward.gov.np', notes: 'File registered: Citizenship Certificate Copy Request' },
      { hoursAgo: 3, actionType: FILE_STATUSES.PENDING, location: 'Baneshwor Verification Desk', officerEmail: 'verification.w02@ward.gov.np', notes: 'Forwarded for document verification' },
    ],
  },
  {
    wardCode: 'W02',
    title: 'Land Ownership Certificate Transfer',
    citizenName: 'Sita Kumari Sharma',
    citizenPhone: '9800000011',
    documentType: 'Land Ownership Certificate',
    requiredDocuments: ['Land Ownership Certificate', 'Tax Clearance Certificate', 'Citizenship Certificate Copy'],
    steps: [
      { hoursAgo: 25, actionType: FILE_STATUSES.RECEIVED, location: 'Baneshwor Reception', officerEmail: 'reception.w02@ward.gov.np', notes: 'File registered: Land Ownership Certificate Transfer' },
      { hoursAgo: 12, actionType: FILE_STATUSES.PENDING, location: 'Baneshwor Verification Desk', officerEmail: 'verification.w02@ward.gov.np', notes: 'Forwarded for document verification' },
      { hoursAgo: 1, actionType: FILE_STATUSES.APPROVED, location: 'Baneshwor Ward Chair Section', officerEmail: 'admin.w02@ward.gov.np', notes: 'Approved and endorsed by ward chair', isFinal: true },
    ],
  },
  {
    wardCode: 'W02',
    title: 'Marriage Registration Certificate',
    citizenName: 'Krishna Bahadur KC',
    citizenPhone: '9800000012',
    documentType: 'Marriage Registration',
    requiredDocuments: ['Application Form', 'Citizenship Certificate Copy', 'Recommendation Letter'],
    steps: [
      { hoursAgo: 10, actionType: FILE_STATUSES.RECEIVED, location: 'Baneshwor Reception', officerEmail: 'reception.w02@ward.gov.np', notes: 'File registered: Marriage Registration Certificate' },
      { hoursAgo: 5, actionType: FILE_STATUSES.PENDING, location: 'Baneshwor Verification Desk', officerEmail: 'verification.w02@ward.gov.np', notes: 'Forwarded for document verification' },
      {
        hoursAgo: 1,
        actionType: FILE_STATUSES.BACKTRACKED,
        location: 'Baneshwor Reception',
        officerEmail: 'verification.w02@ward.gov.np',
        notes: 'Backtracked: Recommendation Letter not attached',
        backtrackReason: 'Recommendation Letter not attached',
        isBacktrack: true,
      },
    ],
  },
];

function hoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

/**
 * Core seed: departments + login accounts for Ward W01. Unchanged from the
 * original seed script — always runs, regardless of CLI flags.
 */
async function seedCore() {
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
}

/**
 * Demo-only extras: a second ward's departments and additional officer/admin
 * accounts. Only runs when --demo is passed.
 */
async function seedDemoExtras() {
  console.log('Seeder: Seeding additional demo ward departments and officers...');

  for (const seedDept of DEMO_DEPARTMENTS_W02) {
    const existingDept = await Department.findOne({ code: seedDept.code, wardCode: seedDept.wardCode });
    if (existingDept) {
      console.log(`Seeder: Demo department skipped (already exists): ${seedDept.code}`);
      continue;
    }
    await Department.create(seedDept);
    console.log(`Seeder: Successfully registered demo department -> ${seedDept.name} (${seedDept.code})`);
  }

  for (const seedUser of DEMO_OFFICERS) {
    const emailLower = seedUser.email.toLowerCase();
    const existingUser = await User.findOne({ email: emailLower });

    if (existingUser) {
      console.log(`Seeder: Demo account skipped (already exists): ${emailLower}`);
      continue;
    }

    const passwordHash = await bcrypt.hash(seedUser.password, 12);
    const { password, ...userFields } = seedUser;
    await User.create({
      ...userFields,
      email: emailLower,
      passwordHash,
    });

    console.log(`Seeder: Successfully registered demo account -> ${emailLower} | password: ${password}`);
  }
}

/**
 * Creates demo files with realistic, properly hash-chained movement history
 * by replaying each blueprint's steps through appendMovementLog(), mirroring
 * exactly what registerFile/forwardFile/backtrackFile do at each hop.
 */
async function seedDemoFiles(officersByEmail) {
  console.log('Seeder: Seeding demo files and movement history...');

  for (const blueprint of DEMO_FILE_BLUEPRINTS) {
    const existing = await File.findOne({ citizenPhone: blueprint.citizenPhone, title: blueprint.title }).lean();
    if (existing) {
      console.log(`Seeder: Demo file skipped (already exists): ${blueprint.title} (${blueprint.citizenPhone})`);
      continue;
    }

    const firstStep = blueprint.steps[0];
    const registeringOfficer = officersByEmail[firstStep.officerEmail];
    if (!registeringOfficer) {
      console.warn(`Seeder: Skipping "${blueprint.title}" — officer ${firstStep.officerEmail} not found.`);
      continue;
    }

    // Generate unique identifiers exactly as the registerFile controller does
    let fileUid = '';
    let trackingId = '';
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 10) {
      fileUid = generateFileUid();
      trackingId = generateTrackingId();

      const clash = await File.findOne({ $or: [{ fileUid }, { trackingId }] });
      if (!clash) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      console.warn(`Seeder: Skipping "${blueprint.title}" — could not allocate unique identifiers.`);
      continue;
    }

    const { payload, dataUrl } = await generateQrCode(fileUid, blueprint.wardCode);
    const firstStepTime = hoursAgo(firstStep.hoursAgo);

    const file = new File({
      fileUid,
      trackingId,
      title: blueprint.title,
      citizenName: blueprint.citizenName,
      citizenPhone: blueprint.citizenPhone,
      documentType: blueprint.documentType,
      wardCode: blueprint.wardCode,
      currentStatus: FILE_STATUSES.RECEIVED,
      currentLocation: firstStep.location,
      assignedOfficerId: registeringOfficer._id,
      qrPayload: payload,
      qrDataUrl: dataUrl,
      requiredDocuments: blueprint.requiredDocuments,
    });
    file.createdAt = firstStepTime;
    file.updatedAt = firstStepTime;
    await file.save({ timestamps: false });

    // Append the initial RECEIVED ledger entry
    await appendMovementLog({
      fileId: file._id,
      officerId: registeringOfficer._id,
      actionType: firstStep.actionType,
      currentLocation: firstStep.location,
      notes: firstStep.notes,
      timestamp: firstStepTime,
    });

    // Replay the remaining movement steps in chronological order, mirroring
    // exactly what forwardFile/backtrackFile do at each hop.
    let previousLocation = firstStep.location;
    for (const step of blueprint.steps.slice(1)) {
      const stepOfficer = officersByEmail[step.officerEmail];
      if (!stepOfficer) {
        console.warn(`Seeder: Skipping remaining steps for "${blueprint.title}" — officer ${step.officerEmail} not found.`);
        break;
      }
      const stepTime = hoursAgo(step.hoursAgo);

      file.currentLocation = step.location;
      file.currentStatus = step.actionType;
      file.isClosed = Boolean(step.isFinal);
      file.updatedAt = stepTime;
      await file.save({ timestamps: false });

      await appendMovementLog({
        fileId: file._id,
        officerId: stepOfficer._id,
        actionType: step.actionType,
        currentLocation: step.location,
        previousLocation,
        nextLocation: step.isBacktrack ? undefined : step.location,
        notes: step.notes,
        backtrackReason: step.isBacktrack ? step.backtrackReason : undefined,
        timestamp: stepTime,
      });

      previousLocation = step.location;
    }

    console.log(`Seeder: Successfully seeded demo file -> ${file.fileUid} (${blueprint.title}, ${blueprint.wardCode})`);
  }
}

/**
 * Removes previously seeded demo files and their ledger entries so --demo
 * can be re-run cleanly. Only ever targets documents in the reserved demo
 * citizenPhone range, and refuses to run against a production environment.
 */
async function resetDemoData() {
  if (process.env.NODE_ENV === 'production') {
    console.warn('Seeder: --reset ignored because NODE_ENV=production. Refusing to delete data in production.');
    return;
  }

  const demoFiles = await File.find({ citizenPhone: DEMO_PHONE_PATTERN }).select('_id').lean();
  const demoFileIds = demoFiles.map((f) => f._id);

  if (demoFileIds.length === 0) {
    console.log('Seeder: No existing demo files found to reset.');
    return;
  }

  // MovementHistory enforces immutability at the Mongoose level (see the
  // pre-hooks in MovementHistory.js) to protect the audit ledger from
  // tampering — deleteMany() would throw if called through the model. For
  // this dev-only demo reset we intentionally bypass that guard via the
  // native MongoDB driver, scoped strictly to documents seeded by this
  // script and gated by the NODE_ENV check above.
  const historyResult = await mongoose.connection.db
    .collection('movementhistories')
    .deleteMany({ fileId: { $in: demoFileIds } });

  const fileResult = await File.deleteMany({ _id: { $in: demoFileIds } });

  console.log(
    `Seeder: Reset removed ${fileResult.deletedCount} demo file(s) and ${historyResult.deletedCount} ledger entr${historyResult.deletedCount === 1 ? 'y' : 'ies'}.`
  );
}

async function seedDatabase() {
  const args = process.argv.slice(2);
  const withDemoData = args.includes('--demo');
  const shouldReset = args.includes('--reset');

  console.log('Seeder: Initializing database seeding operations...');

  // Connect to MongoDB
  await connectDatabase();

  try {
    await seedCore();

    if (shouldReset) {
      await resetDemoData();
    }

    if (withDemoData) {
      await seedDemoExtras();

      const officerEmails = [...SEED_USERS, ...DEMO_OFFICERS].map((u) => u.email.toLowerCase());
      const officerDocs = await User.find({ email: { $in: officerEmails } }).lean();
      const officersByEmail = officerDocs.reduce((acc, u) => ({ ...acc, [u.email]: u }), {});

      await seedDemoFiles(officersByEmail);
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