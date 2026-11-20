class AppError extends Error {
  constructor(message, status, extra = {}) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.extra = extra;
  }
}

class ValidationError extends AppError {
  constructor(message, extra) {
    super(message, 400, extra);
  }
}

class ConflictError extends AppError {
  constructor(message, extra) {
    super(message, 400, extra);
  }
}

class NotFoundError extends AppError {
  constructor(message, extra) {
    super(message, 404, extra);
  }
}

class AuthError extends AppError {
  constructor(message = 'Invalid email or password') {
    super(message, 401);
  }
}

class RateLimitedError extends AppError {
  constructor(message = 'Too many failed attempts. Try again later.') {
    super(message, 429);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Your account cannot do this for this book') {
    super(message, 403);
  }
}

module.exports = { AppError, ValidationError, ConflictError, NotFoundError, AuthError, RateLimitedError, ForbiddenError };
