/**
 * Global Express error handling middleware.
 */
export function globalErrorHandler(err, req, res, next) {
  // Log detailed warning internally
  console.error(`[API Error] ${req.method} ${req.path} -> Status: ${err.status || 500} | Msg: ${err.message}`);
  if (process.env.NODE_ENV === 'development' && err.stack) {
    console.error(err.stack);
  }

  let statusCode = err.status || 500;
  let errorPayload = {
    error: err.message || 'An internal system error occurred',
  };

  // 1. Handle Mongoose Validation Errors
  if (err.name === 'ValidationError') {
    statusCode = 400;
    const validationErrors = Object.values(err.errors).map((e) => e.message);
    errorPayload = {
      error: 'Data validation failed',
      details: validationErrors,
    };
  }

  // 2. Handle MongoDB Duplicate Key Errors (e.g. Unique Email / UID check)
  if (err.code === 11000) {
    statusCode = 409;
    const duplicatedField = Object.keys(err.keyValue || {})[0] || 'field';
    errorPayload = {
      error: `A record with this ${duplicatedField} already exists`,
    };
  }

  // 3. Handle Mongoose Cast Errors (e.g. invalid ObjectId)
  if (err.name === 'CastError') {
    statusCode = 400;
    errorPayload = {
      error: `Invalid formatted resource reference on field: ${err.path}`,
    };
  }

  // Inject stack traces only during local development checks
  if (process.env.NODE_ENV === 'development') {
    errorPayload.stack = err.stack;
  }

  return res.status(statusCode).json(errorPayload);
}
