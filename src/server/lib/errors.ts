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

// Business errors raised by our SQL functions and triggers: 'CODE: message'. Authored text, safe to show.
const RAISED =
  /^(STOCK_CONFLICT|PRICE_CONFLICT|CONFLICT|INVALID_TRANSITION|NOT_FOUND|VALIDATION|FORBIDDEN): ?([\s\S]*)$/;
const RAISED_STATUS: Record<string, number> = {
  VALIDATION: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
};

/**
 * Maps a Supabase/PostgREST error to a safe AppError. Raw database text only reaches the
 * response for our own raised business errors; everything else becomes a generic message
 * (500s are logged and masked by errorResponse).
 */
export function dbError(error: { code?: string; message: string }): AppError {
  const raised = RAISED.exec(error.message);
  if (raised) {
    const code = raised[1]!;
    return new AppError(raised[2] || code, RAISED_STATUS[code] ?? 409, code);
  }
  switch (error.code) {
    case "23505":
      return new ConflictError(
        "A record with the same unique value already exists",
      );
    case "23503":
      return new AppError(
        "A referenced record does not exist or is still in use",
        409,
        "REFERENCE_CONFLICT",
      );
    case "23502":
    case "23514":
    case "22P02":
    case "22003":
      return new AppError(
        "A value is missing or out of range",
        400,
        "VALIDATION_ERROR",
      );
    case "42501":
      return new ForbiddenError("Not allowed by the database access rules");
    case "PGRST116":
      return new NotFoundError();
  }
  return new AppError(error.message, 500, "DATABASE_ERROR");
}
