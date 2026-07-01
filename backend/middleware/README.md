# Backend Middleware

Place intermediate Express middleware functions here.

## Common Middlewares
- `authMiddleware.js`: Verifies JWT tokens and attaches user details to requests.
- `rbacMiddleware.js`: Verifies role permission scopes (e.g., checks if a user is an Admin, Staff, or Viewer).
- `errorMiddleware.js`: Custom global error-handling logic for formatting server exceptions.
