import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth';
import { apiJson } from '@/lib/api/response';

export async function GET(request: NextRequest) {
  return withAuth(request, 'read', async (auth) => {
    return apiJson({
      id: auth.userId,
      email: auth.email,
      role: auth.role,
      via: auth.via,
      scopes: auth.scopes,
    });
  });
}
