import { NextRequest } from 'next/server';
import { z } from 'zod';
import { db, users } from '@/lib/db';
import { hashPassword, getSessionForRoute, hasAnyUser } from '@/lib/auth';
import { apiCreated, apiError, apiJson, apiRouteError, readJsonBody } from '@/lib/api/response';

const setupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
}).strict();

export async function GET() {
  return apiJson({ needsSetup: !(await hasAnyUser()) });
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody(request);
    const { email, password } = setupSchema.parse(body);
    const passwordHash = await hashPassword(password);

    const user = db.transaction((tx) => {
      const existing = tx.select({ id: users.id }).from(users).limit(1).all();
      if (existing.length > 0) return null;
      return tx
        .insert(users)
        .values({
          email: email.toLowerCase(),
          passwordHash,
          role: 'admin',
        })
        .returning()
        .get();
    });

    if (!user) {
      return apiError('setup_already_completed', 'Setup has already been completed', 409);
    }

    const res = apiCreated({ id: user.id, email: user.email, role: user.role });
    const session = await getSessionForRoute(request, res);
    session.userId = user.id;
    session.email = user.email;
    session.role = 'admin';
    await session.save();
    return res;
  } catch (err) {
    console.error('Setup failed:', err);
    return apiRouteError(err, 'Setup failed');
  }
}
