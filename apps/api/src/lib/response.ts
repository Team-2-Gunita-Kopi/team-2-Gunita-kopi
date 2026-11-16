import { NextResponse } from "next/server";
import { ApiResponse } from "@gunita/contracts";
import { AppError } from "./errors";

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

  if (error instanceof AppError) {
    statusCode = error.statusCode;
    code = error.code;
    message = error.message;
    details = error.details;
  } else if (error instanceof Error) {
    message = error.message;
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

export function notImplementedResponse(
  feature: string = "Endpoint",
  requestId?: string,
): NextResponse<ApiResponse<never>> {
  return errorResponse(
    new AppError(
      `${feature} is scaffolded but not implemented yet.`,
      501,
      "NOT_IMPLEMENTED",
    ),
    { status: 501, requestId },
  );
}
