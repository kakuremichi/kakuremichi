import { NextRequest, NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, apiTokens, type TokenScope } from '@/lib/db';
import { generateApiToken, withAuth } from '@/lib/auth';

const createTokenSchema = z.object({
  name: z.string().min(1).max(64),
  scopes: z.array(z.enum(['read', 'write', 'admin'])).min(1),
  expiresInDays: z.number().int().positive().max(3650).optional(),
});

export async function GET(request: NextRequest) {
  return withAuth(request, 'read', async (auth) => {
    const rows = await db
      .select({
        id: apiTokens.id,
        name: apiTokens.name,
        prefix: apiTokens.prefix,
        scopes: apiTokens.scopes,
        lastUsedAt: apiTokens.lastUsedAt,
        expiresAt: apiTokens.expiresAt,
        createdAt: apiTokens.createdAt,
      })
      .from(apiTokens)
      .where(eq(apiTokens.userId, auth.userId))
      .orderBy(desc(apiTokens.createdAt));
    return NextResponse.json(rows);
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, 'write', async (auth) => {
    try {
      const body = await request.json();
      const data = createTokenSchema.parse(body);

      if (data.scopes.includes('admin') && auth.role !== 'admin') {
        return NextResponse.json(
          { error: 'Only admins can create admin-scoped tokens' },
          { status: 403 }
        );
      }
      if (
        auth.via === 'token' &&
        data.scopes.includes('admin') &&
        !(auth.scopes ?? []).includes('admin')
      ) {
        return NextResponse.json({ error: 'Cannot escalate scope' }, { status: 403 });
      }

      const generated = generateApiToken();
      const expiresAt = data.expiresInDays
        ? new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000)
        : null;

      const [row] = await db
        .insert(apiTokens)
        .values({
          userId: auth.userId,
          name: data.name,
          prefix: generated.prefix,
          tokenHash: generated.hash,
          scopes: data.scopes as TokenScope[],
          expiresAt,
        })
        .returning({
          id: apiTokens.id,
          name: apiTokens.name,
          prefix: apiTokens.prefix,
          scopes: apiTokens.scopes,
          expiresAt: apiTokens.expiresAt,
          createdAt: apiTokens.createdAt,
        });

      return NextResponse.json({ ...row, token: generated.plaintext }, { status: 201 });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: 'Invalid request', details: err.issues }, { status: 400 });
      }
      console.error('Failed to create token:', err);
      return NextResponse.json({ error: 'Failed to create token' }, { status: 500 });
    }
  });
}
