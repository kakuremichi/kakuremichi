import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getIronSession } from 'iron-session';
import { db, users, apiTokens, type UserRole } from '@/lib/db';
import { apiError } from '@/lib/api/response';
import { sessionOptions, type SessionData } from './session';
import { hashToken, isValidTokenFormat } from './tokens';

export type TokenScope = 'read' | 'write' | 'admin';

export interface AuthedRequest {
  userId: string;
  email: string;
  role: UserRole;
  via: 'session' | 'token';
  tokenId?: string;
  scopes?: TokenScope[];
}

export class AuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function scopeSatisfies(available: TokenScope[], required: TokenScope): boolean {
  if (available.includes('admin')) return true;
  if (required === 'read') return available.includes('read') || available.includes('write');
  if (required === 'write') return available.includes('write');
  return false;
}

async function authFromBearer(request: NextRequest): Promise<AuthedRequest | null> {
  const header = request.headers.get('authorization');
  if (!header || !header.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice(7).trim();
  if (!isValidTokenFormat(token)) {
    throw new AuthError(401, 'Invalid token format');
  }

  const tokenHash = hashToken(token);
  const row = await db
    .select({ token: apiTokens, user: users })
    .from(apiTokens)
    .innerJoin(users, eq(users.id, apiTokens.userId))
    .where(eq(apiTokens.tokenHash, tokenHash))
    .limit(1);

  const first = row[0];
  if (!first) throw new AuthError(401, 'Invalid token');
  const { token: t, user } = first;
  if (t.expiresAt && t.expiresAt.getTime() < Date.now()) {
    throw new AuthError(401, 'Token expired');
  }

  try {
    db.update(apiTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiTokens.id, t.id))
      .run();
  } catch (e) {
    console.error('Failed to update lastUsedAt:', e);
  }

  return {
    userId: user.id,
    email: user.email,
    role: user.role as UserRole,
    via: 'token',
    tokenId: t.id,
    scopes: (t.scopes as TokenScope[]) ?? [],
  };
}

async function authFromSession(request: NextRequest): Promise<AuthedRequest | null> {
  const res = new NextResponse();
  const session = await getIronSession<SessionData>(request, res, sessionOptions());
  if (!session.userId) return null;

  const row = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  const user = row[0];
  if (!user) return null;
  return {
    userId: user.id,
    email: user.email,
    role: user.role as UserRole,
    via: 'session',
  };
}

export async function requireAuth(
  request: NextRequest,
  scope: TokenScope = 'read'
): Promise<AuthedRequest> {
  let authed = await authFromBearer(request);
  if (!authed) authed = await authFromSession(request);
  if (!authed) throw new AuthError(401, 'Authentication required');

  // Scope gating:
  // - Token auth is restricted by the token's own scopes.
  // - Session auth grants full scope for the user's role (admin still required for admin ops).
  if (authed.via === 'token') {
    const scopes = authed.scopes ?? [];
    if (!scopeSatisfies(scopes, scope)) {
      throw new AuthError(403, `Token lacks required scope: ${scope}`);
    }
  }
  if (scope === 'admin' && authed.role !== 'admin') {
    throw new AuthError(403, 'Admin role required');
  }
  return authed;
}

export function authErrorResponse(err: unknown): NextResponse {
  if (err instanceof AuthError) {
    const code = err.status === 401 ? 'unauthorized' : 'forbidden';
    return apiError(code, err.message, err.status);
  }
  console.error('Auth error:', err);
  return apiError('auth_failed', 'Authentication failed', 500);
}

export async function withAuth<T>(
  request: NextRequest,
  scope: TokenScope,
  handler: (auth: AuthedRequest) => Promise<NextResponse<T> | NextResponse>
): Promise<NextResponse> {
  try {
    const auth = await requireAuth(request, scope);
    return await handler(auth);
  } catch (err) {
    return authErrorResponse(err);
  }
}
