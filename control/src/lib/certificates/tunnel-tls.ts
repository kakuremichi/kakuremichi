import { eq } from 'drizzle-orm';
import { db, certificates, tunnelTlsSettings, tunnels } from '@/lib/db';
import { ApiRequestError } from '@/lib/api/response';
import { assertDomainInDnsZone, normalizeCertificateDomain } from './dns01';
import type { TunnelTlsMode } from './types';

export interface TunnelTlsInput {
  mode?: TunnelTlsMode;
  dnsZoneId?: string;
  certificateId?: string | null;
  forceHttps?: boolean;
}

export async function configureTunnelTls(tunnelId: string, input: TunnelTlsInput) {
  const [tunnel] = await db.select().from(tunnels).where(eq(tunnels.id, tunnelId)).limit(1);
  if (!tunnel) {
    throw new ApiRequestError(404, 'not_found', 'Tunnel not found');
  }

  const mode = input.mode ?? 'disabled';
  let certificateId: string | null = null;

  if (mode === 'auto') {
    certificateId = await resolveAutoCertificate(tunnel.domain, input);
  } else if (mode === 'gateway_acme') {
    certificateId = null;
  } else if (mode !== 'disabled') {
    throw new ApiRequestError(400, 'invalid_tls_mode', `Unsupported tunnel TLS mode: ${mode}`);
  }

  const existing = await db
    .select({ id: tunnelTlsSettings.id })
    .from(tunnelTlsSettings)
    .where(eq(tunnelTlsSettings.tunnelId, tunnelId))
    .limit(1);

  const values = {
    mode,
    certificateId,
    forceHttps: input.forceHttps ?? true,
    updatedAt: new Date(),
  };

  if (existing[0]) {
    const [updated] = await db
      .update(tunnelTlsSettings)
      .set(values)
      .where(eq(tunnelTlsSettings.id, existing[0].id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(tunnelTlsSettings)
    .values({
      tunnelId,
      ...values,
    })
    .returning();
  return created;
}

export async function ensureCertificateForDomain(domain: string, dnsZoneId: string) {
  const normalizedDomain = normalizeCertificateDomain(domain);
  await assertDomainInDnsZone(normalizedDomain, dnsZoneId);

  const [existing] = await db
    .select()
    .from(certificates)
    .where(eq(certificates.domain, normalizedDomain))
    .limit(1);
  if (existing) {
    if (existing.dnsZoneId !== dnsZoneId) {
      const [updated] = await db
        .update(certificates)
        .set({ dnsZoneId, updatedAt: new Date() })
        .where(eq(certificates.id, existing.id))
        .returning();
      if (!updated) {
        throw new Error('Certificate disappeared while updating DNS zone');
      }
      return updated;
    }
    return existing;
  }

  const [created] = await db
    .insert(certificates)
    .values({
      domain: normalizedDomain,
      dnsZoneId,
      issuer: 'letsencrypt',
      challengeType: 'dns-01',
      status: 'pending',
      lastError: null,
    })
    .returning();
  if (!created) {
    throw new Error('Failed to create certificate');
  }
  return created;
}

async function resolveAutoCertificate(domain: string, input: TunnelTlsInput): Promise<string> {
  if (input.certificateId) {
    const [certificate] = await db
      .select()
      .from(certificates)
      .where(eq(certificates.id, input.certificateId))
      .limit(1);
    if (!certificate) {
      throw new ApiRequestError(404, 'certificate_not_found', 'Certificate not found');
    }
    if (!certificateCoversDomain(certificate.domain, domain)) {
      throw new ApiRequestError(
        400,
        'certificate_domain_mismatch',
        `Certificate ${certificate.domain} does not cover tunnel domain ${domain}`
      );
    }
    return certificate.id;
  }

  if (!input.dnsZoneId) {
    throw new ApiRequestError(400, 'dns_zone_required', 'dnsZoneId is required for auto TLS');
  }

  const certificate = await ensureCertificateForDomain(domain, input.dnsZoneId);
  return certificate.id;
}

function certificateCoversDomain(certificateDomain: string, tunnelDomain: string): boolean {
  const certDomain = normalizeCertificateDomain(certificateDomain);
  const domain = normalizeCertificateDomain(tunnelDomain);
  if (certDomain === domain) return true;
  if (!certDomain.startsWith('*.')) return false;
  const suffix = certDomain.slice(1);
  if (!domain.endsWith(suffix)) return false;
  const remaining = domain.slice(0, -suffix.length);
  return remaining.length > 0 && !remaining.includes('.');
}
