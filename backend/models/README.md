# Backend Models

This directory defines Mongoose schemas and models which interact with MongoDB.

## Expected Schemas
- `User.js` (name, email, password hash, role, department)
- `Document.js` (title, description, status, tracking history, QR code, OCR text)
- `TrackingLog.js` (documentId, scannedBy, location, status, timestamp)
