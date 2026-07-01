# AI Service Routes

Contains FastAPI router configuration files defining resources and endpoints.

## Expected Endpoints
- `ocr.py`: POST `/ocr` for extracting text from document image uploads.
- `qr.py`: POST `/qr/generate` for generating and returning document QR codes.
- `bottleneck.py`: GET `/bottleneck` analyzing flow history logs to spot departmental blocks.
