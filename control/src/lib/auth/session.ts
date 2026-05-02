import { getIronSession, SessionOptions } from 'iron-session';
import { NextRequest, NextResponse } from 'next/server';

export interface SessionData {
  userId?: string;
  email?: string;
  role?: 'admin' | 'member';
}

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'SESSION_SECRET must be set to at least 32 characters. Generate one with: openssl rand -base64 48'
    );
  }
  return secret;
}

export function sessionOptions(): SessionOptions {
  const secureCookie = process.env.SESSION_COOKIE_SECURE
    ? process.env.SESSION_COOKIE_SECURE === 'true'
    : process.env.NODE_ENV === 'production';

  return {
    password: getSessionSecret(),
    cookieName: 'kakuremichi_session',
    cookieOptions: {
      httpOnly: true,
      sameSite: 'lax',
      secure: secureCookie,
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    },
  };
}

export function getSessionForRoute(req: NextRequest, res: NextResponse) {
  return getIronSession<SessionData>(req, res, sessionOptions());
}
