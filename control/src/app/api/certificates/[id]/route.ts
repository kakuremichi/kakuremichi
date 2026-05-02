import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, certificates, dnsProviders, dnsZones } from '@/lib/db';
import { withAuth } from '@/lib/auth';
import { apiError, apiJson, apiOk, apiRouteError, readJsonBody } from '@/lib/api/response';
import { assertDomainInDnsZone } from '@/lib/certificates/dns01';
import { updateCertificateSchema } from '@/lib/certificates/validation';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, 'read', async () => {
    const { id } = await params;
    const row = await getCertificateRow(id);
    if (!row) {
      return apiError('not_found', 'Certificate not found', 404);
    }
    return apiJson(row);
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, 'admin', async () => {
    try {
      const { id } = await params;
      const existing = await getCertificateRow(id);
      if (!existing) {
        return apiError('not_found', 'Certificate not found', 404);
      }

      const body = await readJsonBody(request);
      const data = updateCertificateSchema.parse(body);
      if (data.dnsZoneId) {
        await assertDomainInDnsZone(existing.domain, data.dnsZoneId);
      }

      const [updated] = await db
        .update(certificates)
        .set({
          ...(data.dnsZoneId !== undefined && { dnsZoneId: data.dnsZoneId }),
          ...(data.status !== undefined && { status: data.status }),
          ...(data.status !== 'error' && { lastError: null }),
          updatedAt: new Date(),
        })
        .where(eq(certificates.id, id))
        .returning({ id: certificates.id });

      if (!updated) {
        return apiError('not_found', 'Certificate not found', 404);
      }
      return apiJson(await getCertificateRow(id));
    } catch (err) {
      console.error('Failed to update certificate:', err);
      return apiRouteError(err, 'Failed to update certificate');
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
      .delete(certificates)
      .where(eq(certificates.id, id))
      .returning({ id: certificates.id });
    if (deleted.length === 0) {
      return apiError('not_found', 'Certificate not found', 404);
    }
    return apiOk();
  });
}

async function getCertificateRow(id: string) {
  const [row] = await db
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
    .where(eq(certificates.id, id))
    .limit(1);
  return row ?? null;
}
