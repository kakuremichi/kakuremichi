import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

export function apiJson<T>(body: T, status = 200): NextResponse<T> {
  return NextResponse.json(body, { status });
}

export function apiCreated<T>(body: T): NextResponse<T> {
  return apiJson(body, 201);
}

export function apiOk(): NextResponse<{ ok: true }> {
  return apiJson({ ok: true });
}

export function apiError(
  code: string,
  message: string,
  status: number,
  details?: unknown
): NextResponse {
  return NextResponse.json(
    {
      error: message,
      code,
      ...(details === undefined ? {} : { details }),
    },
    { status }
  );
}

export function apiValidationError(error: ZodError): NextResponse {
  return apiError('validation_failed', 'Validation failed', 400, error.issues);
}

export function apiRouteError(error: unknown, fallbackMessage: string): NextResponse {
  if (error instanceof ApiRequestError) {
    return apiError(error.code, error.message, error.status, error.details);
  }
  if (error instanceof ZodError) {
    return apiValidationError(error);
  }
  return apiError('internal_error', fallbackMessage, 500);
}

export async function readJsonBody(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiRequestError(400, 'invalid_json', 'Request body must be valid JSON');
  }
}
