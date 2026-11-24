import { NextRequest, NextResponse } from "next/server";
import { ApiResponse } from "@/contracts";
import { ZodError } from "zod";
import { AppError } from "./errors";
import { logger } from "./logger";

export function jsonResponse<T>(
  data?: T,
  init?: { status?: number; headers?: HeadersInit; requestId?: string },
): NextResponse<ApiResponse<T>> {
  const status = init?.status ?? 200;
  const body: ApiResponse<T> = {
    success: true,
    data,
    meta: {
      requestId: init?.requestId,
      timestamp: new Date().toISOString(),
    },
  };

  return NextResponse.json(body, {
    status,
    headers: init?.headers,
  });
}

export function errorResponse(
  error: unknown,
  init?: { status?: number; headers?: HeadersInit; requestId?: string },
): NextResponse<ApiResponse<never>> {
  let statusCode = init?.status ?? 500;
  let code = "INTERNAL_SERVER_ERROR";
  let message = "An unexpected error occurred";
  let details: unknown = undefined;

  if (error instanceof ZodError) {
    statusCode = 400;
    code = "VALIDATION_ERROR";
    message = "Invalid request";
    details = error.issues.map((i) => ({ path: i.path, message: i.message }));
  } else if (error instanceof AppError) {
    statusCode = error.statusCode;
    code = error.code;
    message = error.message;
    details = error.details;
  }

  // Server errors: keep details in the logs, never in the response (they can hold database
  // internals).
  if (statusCode >= 500) {
    logger.error("request.failed", {
      status: statusCode,
      code,
      error: error instanceof Error ? error.message : String(error),
    });
    message =
      statusCode === 503
        ? "Service temporarily unavailable"
        : "An unexpected error occurred";
    details = undefined;
  }

  const body: ApiResponse<never> = {
    success: false,
    error: {
      code,
      message,
      details,
    },
    meta: {
      requestId: init?.requestId,
      timestamp: new Date().toISOString(),
    },
  };

  return NextResponse.json(body, {
    status: statusCode,
    headers: init?.headers,
  });
}

/** Wraps a route handler so every thrown error becomes a safe errorResponse. */
export function route<C>(
  fn: (req: NextRequest, ctx: C) => Promise<Response>,
): (req: NextRequest, ctx: C) => Promise<Response> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (error) {
      return errorResponse(error);
    }
  };
}
