import { NextRequest, NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { z } from 'zod';
import { db, dnsProviders } from '@/lib/db';
import { encryptJson } from '@/lib/dns/crypto';
import { createDNSProvider } from '@/lib/dns/providers';
import { withAuth } from '@/lib/auth';

const createProviderSchema = z.object({
  name: z.string().min(1).max(64),
  type: z.literal('cloudflare'),
  apiToken: z.string().min(1),
});

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
    return NextResponse.json(rows);
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, 'admin', async () => {
    try {
      const body = await request.json();
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

      return NextResponse.json(row, { status: 201 });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: 'Invalid request', details: err.issues }, { status: 400 });
      }
      console.error('Failed to create DNS provider:', err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Failed to create DNS provider' },
        { status: 500 }
      );
    }
  });
}
