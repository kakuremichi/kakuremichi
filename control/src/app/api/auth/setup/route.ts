import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, users } from '@/lib/db';
import { hashPassword, getSessionForRoute, hasAnyUser } from '@/lib/auth';

const setupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function GET() {
  return NextResponse.json({ needsSetup: !(await hasAnyUser()) });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
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
      return NextResponse.json(
        { error: 'Setup has already been completed' },
        { status: 409 }
      );
    }

    const res = NextResponse.json(
      { id: user.id, email: user.email, role: user.role },
      { status: 201 }
    );
    const session = await getSessionForRoute(request, res);
    session.userId = user.id;
    session.email = user.email;
    session.role = 'admin';
    await session.save();
    return res;
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', details: err.issues }, { status: 400 });
    }
    console.error('Setup failed:', err);
    return NextResponse.json({ error: 'Setup failed' }, { status: 500 });
  }
}
