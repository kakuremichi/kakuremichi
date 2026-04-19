import { NextRequest, NextResponse } from 'next/server';
import { getSessionForRoute } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const res = NextResponse.json({ ok: true });
  const session = await getSessionForRoute(request, res);
  session.destroy();
  return res;
}
