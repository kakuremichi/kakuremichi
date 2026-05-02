import { NextRequest } from 'next/server';
import { desc } from 'drizzle-orm';
import { z } from 'zod';
import { db, dnsProviders } from '@/lib/db';
import { encryptJson } from '@/lib/dns/crypto';
import { createDNSProvider } from '@/lib/dns/providers';
import { withAuth } from '@/lib/auth';
import { apiCreated, apiError, apiJson, apiRouteError, readJsonBody } from '@/lib/api/response';

const createProviderSchema = z.object({
  name: z.string().min(1).max(64),
  type: z.literal('cloudflare'),
  apiToken: z.string().min(1),
}).strict();

export async function GET(request: NextRequest) {
  return withAuth(request, 'admin', async () => {
    const rows = await db
      .select({
        id: dnsProviders.id,
        name: dnsProviders.name,
        type: dnsProviders.type,
        enabled: dnsProviders.enabled,
        lastSyncAt: dnsProviders.lastSyncAt,
        lastError: dnsProviders.lastError,
        createdAt: dnsProviders.createdAt,
        updatedAt: dnsProviders.updatedAt,
      })
      .from(dnsProviders)
      .orderBy(desc(dnsProviders.createdAt));
    return apiJson(rows);
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, 'admin', async () => {
    try {
      const body = await readJsonBody(request);
      const data = createProviderSchema.parse(body);
      const provider = createDNSProvider(data.type, { apiToken: data.apiToken });
      await provider.validateCredentials();

      const [row] = await db
        .insert(dnsProviders)
        .values({
          name: data.name,
          type: data.type,
          encryptedConfig: encryptJson({ apiToken: data.apiToken }),
          enabled: true,
          lastError: null,
        })
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

      return apiCreated(row);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return apiRouteError(err, 'Failed to create DNS provider');
      }
      console.error('Failed to create DNS provider:', err);
      return apiError(
        'dns_provider_error',
        err instanceof Error ? err.message : 'Failed to create DNS provider',
        502
      );
    }
  });
}
