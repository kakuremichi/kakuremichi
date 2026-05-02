import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, users } from '@/lib/db';
import { getSessionForRoute, verifyPassword } from '@/lib/auth';
import { apiError, apiJson, apiRouteError, readJsonBody } from '@/lib/api/response';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody(request);
    const { email, password } = loginSchema.parse(body);

    const row = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);
    const user = row[0];
    const ok = user ? await verifyPassword(password, user.passwordHash) : false;
    if (!user || !ok) {
      return apiError('invalid_credentials', 'Invalid email or password', 401);
    }

    const res = apiJson({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    const session = await getSessionForRoute(request, res);
    session.userId = user.id;
    session.email = user.email;
    session.role = user.role as 'admin' | 'member';
    await session.save();
    return res;
  } catch (err) {
    console.error('Login failed:', err);
    return apiRouteError(err, 'Login failed');
  }
}
