import { db, users } from '@/lib/db';
import { hashPassword } from './password';

export async function hasAnyUser(): Promise<boolean> {
  const rows = await db.select({ id: users.id }).from(users).limit(1);
  return rows.length > 0;
}

export async function createAdminUser(email: string, password: string) {
  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({
      email: email.toLowerCase(),
      passwordHash,
      role: 'admin',
    })
    .returning();
  return user;
}

export async function ensureInitialAdmin() {
  if (await hasAnyUser()) return;
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.log('[auth] No users in DB. Set ADMIN_EMAIL and ADMIN_PASSWORD to auto-create, or visit /setup.');
    return;
  }
  if (password.length < 8) {
    console.error('[auth] ADMIN_PASSWORD must be at least 8 characters; skipping.');
    return;
  }
  const user = await createAdminUser(email, password);
  delete process.env.ADMIN_PASSWORD;
  console.log(`[auth] Created initial admin user: ${user?.email ?? email}`);
}
