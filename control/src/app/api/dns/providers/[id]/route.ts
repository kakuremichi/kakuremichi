import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, dnsProviders } from '@/lib/db';
import { getDNSProviderCapabilities } from '@/lib/dns/providers';
import type { DNSProviderCapabilities, DNSProviderType } from '@/lib/dns/types';
import { withAuth } from '@/lib/auth';
import { apiError, apiJson, apiOk, apiRouteError, readJsonBody } from '@/lib/api/response';

const updateProviderSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  enabled: z.boolean().optional(),
}).strict();

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, 'admin', async () => {
    try {
      const { id } = await params;
      const body = await readJsonBody(request);
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
        return apiError('not_found', 'DNS provider not found', 404);
      }
      return apiJson(withCapabilities(row));
    } catch (err) {
      console.error('Failed to update DNS provider:', err);
      return apiRouteError(err, 'Failed to update DNS provider');
    }
  });
}

function withCapabilities<T extends { type: string }>(
  row: T
): T & { capabilities: DNSProviderCapabilities | null } {
  try {
    return { ...row, capabilities: getDNSProviderCapabilities(row.type as DNSProviderType) };
  } catch {
    return { ...row, capabilities: null };
  }
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
      return apiError('not_found', 'DNS provider not found', 404);
    }
    return apiOk();
  });
}
