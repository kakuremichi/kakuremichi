import type { DNSProvider, DNSRecord, DesiredDNSRecord } from './types';

export async function upsertDNSRecord(
  provider: DNSProvider,
  zoneId: string,
  desired: DesiredDNSRecord
): Promise<DNSRecord> {
  const remoteRecords = await provider.listRecords(zoneId, desired.name, desired.type);
  const reusable = findReusableDNSRecord(remoteRecords, desired);
  if (reusable) {
    return provider.updateRecord(zoneId, reusable.id, desired);
  }

  try {
    return await provider.createRecord(zoneId, desired);
  } catch (error) {
    if (!isDuplicateRecordError(error)) throw error;

    const refreshedRecords = await provider.listRecords(zoneId, desired.name, desired.type);
    const refreshed = findReusableDNSRecord(refreshedRecords, desired);
    if (!refreshed) throw error;
    return provider.updateRecord(zoneId, refreshed.id, desired);
  }
}

export function providerSupportsRecord(provider: DNSProvider, type: DesiredDNSRecord['type']): boolean {
  return provider.getCapabilities().supportedRecordTypes.includes(type);
}

export function findReusableDNSRecord(
  records: DNSRecord[],
  desired: DesiredDNSRecord,
  claimedRecordIds: Set<string> = new Set()
): DNSRecord | undefined {
  return records.find(
    (record) =>
      !claimedRecordIds.has(record.id) &&
      record.name.toLowerCase() === desired.name.toLowerCase() &&
      record.type === desired.type &&
      record.content === desired.content &&
      recordProxiedMatches(record, desired)
  );
}

export function isDuplicateRecordError(error: unknown): boolean {
  return error instanceof Error && error.message.toLowerCase().includes('identical record already exists');
}

function recordProxiedMatches(record: DNSRecord, desired: DesiredDNSRecord): boolean {
  if (desired.proxied === undefined) return true;
  return (record.proxied ?? false) === desired.proxied;
}
