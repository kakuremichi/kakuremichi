import { NextRequest } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, apiTokens, type TokenScope } from '@/lib/db';
import { generateApiToken, withAuth } from '@/lib/auth';
import { apiCreated, apiError, apiJson, apiRouteError, readJsonBody } from '@/lib/api/response';

const createTokenSchema = z.object({
  name: z.string().min(1).max(64),
  scopes: z.array(z.enum(['read', 'write', 'admin'])).min(1),
  expiresInDays: z.number().int().positive().max(3650).optional(),
}).strict();

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
    return apiJson(rows);
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, 'write', async (auth) => {
    try {
      const body = await readJsonBody(request);
      const data = createTokenSchema.parse(body);

      if (data.scopes.includes('admin') && auth.role !== 'admin') {
        return apiError('forbidden', 'Only admins can create admin-scoped tokens', 403);
      }
      if (
        auth.via === 'token' &&
        data.scopes.includes('admin') &&
        !(auth.scopes ?? []).includes('admin')
      ) {
        return apiError('forbidden', 'Cannot escalate scope', 403);
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

      return apiCreated({ ...row, token: generated.plaintext });
    } catch (err) {
      console.error('Failed to create token:', err);
      return apiRouteError(err, 'Failed to create token');
    }
  });
}
