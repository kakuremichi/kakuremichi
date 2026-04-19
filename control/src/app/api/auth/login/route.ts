import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, users } from '@/lib/db';
import { getSessionForRoute, verifyPassword } from '@/lib/auth';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = loginSchema.parse(body);

    const row = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);
    const user = row[0];
    const ok = user ? await verifyPassword(password, user.passwordHash) : false;
    if (!user || !ok) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const res = NextResponse.json({
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
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', details: err.issues }, { status: 400 });
    }
    console.error('Login failed:', err);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
