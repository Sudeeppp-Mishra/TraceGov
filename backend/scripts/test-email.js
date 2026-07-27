import dotenv from 'dotenv';
import { sendEmailNotification } from '../src/services/emailService.js';

dotenv.config();

console.log('Testing Email Dispatch...');
console.log('SMTP_HOST:', process.env.SMTP_HOST);
console.log('SMTP_USER:', process.env.SMTP_USER);

const testFile = {
  citizenName: 'Sudeep Mishra',
  title: 'Passport Registration File',
  fileUid: 'TG-TEST-001',
  trackingId: 'TEST12345',
  citizenEmail: process.env.TEST_RECIPIENT_EMAIL || 'contact.sudeepm@gmail.com',
  currentStatus: 'Approved',
  currentLocation: 'Mayor Office Desk',
};

const result = await sendEmailNotification({
  file: testFile,
  status: 'Approved',
  location: 'Mayor Office Desk',
  notes: 'All documents verified successfully.',
});

console.log('\n--- Email Result ---');
console.log(result);
