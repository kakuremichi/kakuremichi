import { NextRequest, NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db, dnsProviders, dnsZones } from '@/lib/db';
import { withAuth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  return withAuth(request, 'read', async () => {
    const rows = await db
      .select({
        id: dnsZones.id,
        name: dnsZones.name,
        providerZoneId: dnsZones.providerZoneId,
        enabled: dnsZones.enabled,
        providerId: dnsProviders.id,
        providerName: dnsProviders.name,
        providerType: dnsProviders.type,
        createdAt: dnsZones.createdAt,
        updatedAt: dnsZones.updatedAt,
      })
      .from(dnsZones)
      .innerJoin(dnsProviders, eq(dnsZones.providerId, dnsProviders.id))
      .orderBy(desc(dnsZones.createdAt));
    return NextResponse.json(rows);
  });
}
