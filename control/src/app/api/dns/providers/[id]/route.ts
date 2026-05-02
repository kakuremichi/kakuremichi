import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, dnsProviders } from '@/lib/db';
import { withAuth } from '@/lib/auth';

const updateProviderSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  enabled: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, 'admin', async () => {
    try {
      const { id } = await params;
      const body = await request.json();
      const data = updateProviderSchema.parse(body);
      const [row] = await db
        .update(dnsProviders)
        .set({
          ...(data.name !== undefined && { name: data.name }),
          ...(data.enabled !== undefined && { enabled: data.enabled }),
          updatedAt: new Date(),
        })
        .where(eq(dnsProviders.id, id))
        .returning({
          id: dnsProviders.id,
          name: dnsProviders.name,
          type: dnsProviders.type,
          enabled: dnsProviders.enabled,
          lastSyncAt: dnsProviders.lastSyncAt,
          lastError: dnsProviders.lastError,
          createdAt: dnsProviders.createdAt,
          updatedAt: dnsProviders.updatedAt,
        });

      if (!row) {
        return NextResponse.json({ error: 'DNS provider not found' }, { status: 404 });
      }
      return NextResponse.json(row);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: 'Invalid request', details: err.issues }, { status: 400 });
      }
      console.error('Failed to update DNS provider:', err);
      return NextResponse.json({ error: 'Failed to update DNS provider' }, { status: 500 });
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, 'admin', async () => {
    const { id } = await params;
    const deleted = await db
      .delete(dnsProviders)
      .where(eq(dnsProviders.id, id))
      .returning({ id: dnsProviders.id });
    if (deleted.length === 0) {
      return NextResponse.json({ error: 'DNS provider not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  });
}
