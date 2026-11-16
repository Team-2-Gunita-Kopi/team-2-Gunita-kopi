export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode: number = 400,
    code: string = "BAD_REQUEST",
    details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = "Unauthorized: Missing or invalid token") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = "Forbidden: Insufficient role permissions") {
    super(message, 403, "FORBIDDEN");
  }
}

export class NotImplementedError extends AppError {
  constructor(
    message: string = "Route handler scaffolded: not implemented yet",
  ) {
    super(message, 501, "NOT_IMPLEMENTED");
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = "Resource not found") {
    super(message, 404, "NOT_FOUND");
  }
}

export class ConflictError extends AppError {
  constructor(message: string = "Resource conflict or duplicate request") {
    super(message, 409, "CONFLICT");
  }
}
