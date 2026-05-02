import { NextRequest } from 'next/server';
import { getSessionForRoute } from '@/lib/auth';
import { apiOk } from '@/lib/api/response';

export async function POST(request: NextRequest) {
  const res = apiOk();
  const session = await getSessionForRoute(request, res);
  session.destroy();
  return res;
}
