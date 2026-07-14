/**
 * Custom security headers middleware to act as a lightweight, zero-dependency alternative to Helmet.
 */
export function secureHeaders(req, res, next) {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking by disallowing framing outside same origin
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  // Basic XSS Protection for older browsers
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Control referrer information sent with requests
  res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');

  // Prevent browsers from sending cookies on cross-site requests
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

  // Strict-Transport-Security (HTTPS enforcement)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Content Security Policy (default restrictions for APIs)
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; base-uri 'self'; font-src 'self' https: data:; form-action 'self'; frame-ancestors 'self'; img-src 'self' data:; object-src 'none'; script-src 'self'; script-src-attr 'none'; style-src 'self' https: 'unsafe-inline'; upgrade-insecure-requests"
  );

  next();
}
