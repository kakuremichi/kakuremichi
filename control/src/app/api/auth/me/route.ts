import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  return withAuth(request, 'read', async (auth) => {
    return NextResponse.json({
      id: auth.userId,
      email: auth.email,
      role: auth.role,
      via: auth.via,
      scopes: auth.scopes,
    });
  });
}
