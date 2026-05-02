import { eq } from 'drizzle-orm';
import { db, dnsProviders, dnsZones } from '@/lib/db';
import { decryptJson } from '@/lib/dns/crypto';
import { createDNSProvider } from '@/lib/dns/providers';
import { providerSupportsRecord, upsertDNSRecord } from '@/lib/dns/records';
import type { DNSProviderConfig, DNSProviderType, DNSRecord } from '@/lib/dns/types';
import { ApiRequestError } from '@/lib/api/response';

export function normalizeCertificateDomain(domain: string): string {
  return domain.trim().replace(/\.$/, '').toLowerCase();
}

export function dns01RecordName(domain: string): string {
  const normalized = normalizeCertificateDomain(domain);
  const base = normalized.startsWith('*.') ? normalized.slice(2) : normalized;
  return `_acme-challenge.${base}`;
}

export async function assertDomainInDnsZone(domain: string, dnsZoneId: string): Promise<void> {
  const zone = await getDnsZone(dnsZoneId);
  const normalizedDomain = normalizeCertificateDomain(domain);
  const normalizedZone = zone.name.toLowerCase();
  const baseDomain = normalizedDomain.startsWith('*.')
    ? normalizedDomain.slice(2)
    : normalizedDomain;

  if (baseDomain !== normalizedZone && !baseDomain.endsWith(`.${normalizedZone}`)) {
    throw new ApiRequestError(
      400,
      'domain_outside_dns_zone',
      `Certificate domain ${domain} is outside DNS zone ${zone.name}`
    );
  }
}

export async function upsertDns01Challenge(
  dnsZoneId: string,
  domain: string,
  value: string,
  ttl = 60
): Promise<DNSRecord> {
  const { zone, providerRow } = await getDnsZoneWithProvider(dnsZoneId);
  const provider = createDNSProvider(
    providerRow.type as DNSProviderType,
    decryptJson<DNSProviderConfig>(providerRow.encryptedConfig)
  );
  if (!providerSupportsRecord(provider, 'TXT')) {
    throw new Error(`${providerRow.type} does not support TXT records for DNS-01`);
  }

  return upsertDNSRecord(provider, zone.providerZoneId, {
    name: dns01RecordName(domain),
    type: 'TXT',
    content: value,
    ttl,
  });
}

export async function deleteDns01Challenge(
  dnsZoneId: string,
  domain: string,
  value: string
): Promise<void> {
  const { zone, providerRow } = await getDnsZoneWithProvider(dnsZoneId);
  const provider = createDNSProvider(
    providerRow.type as DNSProviderType,
    decryptJson<DNSProviderConfig>(providerRow.encryptedConfig)
  );
  if (!providerSupportsRecord(provider, 'TXT')) return;

  const records = await provider.listRecords(zone.providerZoneId, dns01RecordName(domain), 'TXT');
  await Promise.all(
    records
      .filter((record) => record.content === value)
      .map((record) => provider.deleteRecord(zone.providerZoneId, record.id))
  );
}

async function getDnsZone(dnsZoneId: string) {
  const [zone] = await db
    .select()
    .from(dnsZones)
    .where(eq(dnsZones.id, dnsZoneId))
    .limit(1);
  if (!zone) {
    throw new ApiRequestError(404, 'dns_zone_not_found', 'DNS zone not found');
  }
  return zone;
}

async function getDnsZoneWithProvider(dnsZoneId: string) {
  const [row] = await db
    .select({ zone: dnsZones, providerRow: dnsProviders })
    .from(dnsZones)
    .innerJoin(dnsProviders, eq(dnsZones.providerId, dnsProviders.id))
    .where(eq(dnsZones.id, dnsZoneId))
    .limit(1);

  if (!row) {
    throw new ApiRequestError(404, 'dns_zone_not_found', 'DNS zone not found');
  }
  if (!row.zone.enabled || !row.providerRow.enabled) {
    throw new ApiRequestError(400, 'dns_zone_disabled', 'DNS zone or provider is disabled');
  }
  return row;
}
