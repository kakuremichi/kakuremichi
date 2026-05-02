import { NextRequest } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db, certificates, dnsProviders, dnsZones } from '@/lib/db';
import { withAuth } from '@/lib/auth';
import { apiCreated, apiError, apiJson, apiRouteError, readJsonBody } from '@/lib/api/response';
import { assertDomainInDnsZone } from '@/lib/certificates/dns01';
import { createCertificateSchema } from '@/lib/certificates/validation';

export async function GET(request: NextRequest) {
  return withAuth(request, 'read', async () => {
    const rows = await db
      .select({
        id: certificates.id,
        domain: certificates.domain,
        dnsZoneId: certificates.dnsZoneId,
        dnsZoneName: dnsZones.name,
        dnsProviderId: dnsProviders.id,
        dnsProviderName: dnsProviders.name,
        dnsProviderType: dnsProviders.type,
        issuer: certificates.issuer,
        challengeType: certificates.challengeType,
        status: certificates.status,
        notBefore: certificates.notBefore,
        notAfter: certificates.notAfter,
        renewAfter: certificates.renewAfter,
        fingerprintSha256: certificates.fingerprintSha256,
        lastIssuedAt: certificates.lastIssuedAt,
        lastError: certificates.lastError,
        createdAt: certificates.createdAt,
        updatedAt: certificates.updatedAt,
      })
      .from(certificates)
      .leftJoin(dnsZones, eq(certificates.dnsZoneId, dnsZones.id))
      .leftJoin(dnsProviders, eq(dnsZones.providerId, dnsProviders.id))
      .orderBy(desc(certificates.createdAt));

    return apiJson(rows);
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, 'admin', async () => {
    try {
      const body = await readJsonBody(request);
      const data = createCertificateSchema.parse(body);
      await assertDomainInDnsZone(data.domain, data.dnsZoneId);
      const existing = await db
        .select({ id: certificates.id })
        .from(certificates)
        .where(eq(certificates.domain, data.domain))
        .limit(1);
      if (existing.length > 0) {
        return apiError('conflict', 'Certificate domain already exists', 409);
      }

      const [row] = await db
        .insert(certificates)
        .values({
          domain: data.domain,
          dnsZoneId: data.dnsZoneId,
          issuer: data.issuer,
          challengeType: data.challengeType,
          status: 'pending',
          lastError: null,
        })
        .returning({
          id: certificates.id,
          domain: certificates.domain,
          dnsZoneId: certificates.dnsZoneId,
          issuer: certificates.issuer,
          challengeType: certificates.challengeType,
          status: certificates.status,
          notBefore: certificates.notBefore,
          notAfter: certificates.notAfter,
          renewAfter: certificates.renewAfter,
          fingerprintSha256: certificates.fingerprintSha256,
          lastIssuedAt: certificates.lastIssuedAt,
          lastError: certificates.lastError,
          createdAt: certificates.createdAt,
          updatedAt: certificates.updatedAt,
        });

      return apiCreated(row);
    } catch (err) {
      console.error('Failed to create certificate:', err);
      return apiRouteError(err, 'Failed to create certificate');
    }
  });
}
