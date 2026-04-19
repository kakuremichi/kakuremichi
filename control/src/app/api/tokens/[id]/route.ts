import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, apiTokens } from '@/lib/db';
import { withAuth } from '@/lib/auth';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(request, 'write', async (auth) => {
    const { id } = await params;
    const where =
      auth.role === 'admin'
        ? eq(apiTokens.id, id)
        : and(eq(apiTokens.id, id), eq(apiTokens.userId, auth.userId))!;

    const deleted = await db.delete(apiTokens).where(where).returning({ id: apiTokens.id });
    if (deleted.length === 0) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  });
}
