import { eq } from 'drizzle-orm';
import {
  db,
  dnsManagedRecords,
  dnsProviders,
  dnsSyncSettings,
  dnsZones,
  gateways,
  tunnels,
} from '@/lib/db';
import { decryptJson } from './crypto';
import { createDNSProvider } from './providers';
import type {
  DNSProviderConfig,
  DNSProvider,
  DNSProviderType,
  DNSRecord,
  DNSRecordType,
  DNSSyncStrategy,
  DesiredDNSRecord,
  SyncResult,
} from './types';

interface TargetGateway {
  id: string;
  publicIp: string;
}

export async function importDnsZones(providerId: string) {
  const providerRow = await getProvider(providerId);
  const provider = createDNSProvider(
    providerRow.type as DNSProviderType,
    decryptJson<DNSProviderConfig>(providerRow.encryptedConfig)
  );
  const remoteZones = await provider.listZones();
  const existingZones = await db
    .select()
    .from(dnsZones)
    .where(eq(dnsZones.providerId, providerId));

  const existingByProviderId = new Map(existingZones.map((zone) => [zone.providerZoneId, zone]));
  const imported = [];

  for (const zone of remoteZones) {
    const existing = existingByProviderId.get(zone.id);
    if (existing) {
      const [updated] = await db
        .update(dnsZones)
        .set({ name: zone.name, enabled: true, updatedAt: new Date() })
        .where(eq(dnsZones.id, existing.id))
        .returning();
      imported.push(updated);
    } else {
      const [created] = await db
        .insert(dnsZones)
        .values({
          providerId,
          name: zone.name,
          providerZoneId: zone.id,
          enabled: true,
        })
        .returning();
      imported.push(created);
    }
  }

  await db
    .update(dnsProviders)
    .set({ lastSyncAt: new Date(), lastError: null, updatedAt: new Date() })
    .where(eq(dnsProviders.id, providerId));

  return imported;
}

export async function syncAllDnsSettings(): Promise<SyncResult[]> {
  const settings = await db.select({ tunnelId: dnsSyncSettings.tunnelId }).from(dnsSyncSettings);
  const results: SyncResult[] = [];
  for (const setting of settings) {
    try {
      results.push(await syncTunnelDns(setting.tunnelId));
    } catch (error) {
      results.push({
        synced: false,
        tunnelId: setting.tunnelId,
        message: error instanceof Error ? error.message : 'DNS sync failed',
      });
    }
  }
  return results;
}

export async function syncTunnelDns(tunnelId: string): Promise<SyncResult> {
  const [row] = await db
    .select({
      setting: dnsSyncSettings,
      tunnel: tunnels,
      zone: dnsZones,
      provider: dnsProviders,
    })
    .from(dnsSyncSettings)
    .innerJoin(tunnels, eq(dnsSyncSettings.tunnelId, tunnels.id))
    .innerJoin(dnsZones, eq(dnsSyncSettings.zoneId, dnsZones.id))
    .innerJoin(dnsProviders, eq(dnsZones.providerId, dnsProviders.id))
    .where(eq(dnsSyncSettings.tunnelId, tunnelId))
    .limit(1);

  if (!row) {
    return { synced: false, tunnelId, message: 'DNS sync is not configured for this tunnel' };
  }

  if (!row.setting.enabled) {
    return { synced: false, tunnelId, message: 'DNS sync is disabled for this tunnel' };
  }
  if (!row.zone.enabled || !row.provider.enabled) {
    return { synced: false, tunnelId, message: 'DNS zone or provider is disabled' };
  }

  try {
    const result = await syncRow(row);
    await db
      .update(dnsSyncSettings)
      .set({ lastSyncAt: new Date(), lastError: null, updatedAt: new Date() })
      .where(eq(dnsSyncSettings.id, row.setting.id));
    await db
      .update(dnsProviders)
      .set({ lastSyncAt: new Date(), lastError: null, updatedAt: new Date() })
      .where(eq(dnsProviders.id, row.provider.id));
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'DNS sync failed';
    await db
      .update(dnsSyncSettings)
      .set({ lastError: message, updatedAt: new Date() })
      .where(eq(dnsSyncSettings.id, row.setting.id));
    await db
      .update(dnsProviders)
      .set({ lastError: message, updatedAt: new Date() })
      .where(eq(dnsProviders.id, row.provider.id));
    throw error;
  }
}

export async function deleteTunnelDnsRecords(tunnelId: string): Promise<void> {
  const [row] = await db
    .select({
      setting: dnsSyncSettings,
      zone: dnsZones,
      provider: dnsProviders,
    })
    .from(dnsSyncSettings)
    .innerJoin(dnsZones, eq(dnsSyncSettings.zoneId, dnsZones.id))
    .innerJoin(dnsProviders, eq(dnsZones.providerId, dnsProviders.id))
    .where(eq(dnsSyncSettings.tunnelId, tunnelId))
    .limit(1);

  if (!row) return;

  const managedRecords = await db
    .select()
    .from(dnsManagedRecords)
    .where(eq(dnsManagedRecords.syncSettingId, row.setting.id));

  const provider = createDNSProvider(
    row.provider.type as DNSProviderType,
    decryptJson<DNSProviderConfig>(row.provider.encryptedConfig)
  );

  for (const record of managedRecords) {
    try {
      await provider.deleteRecord(row.zone.providerZoneId, record.providerRecordId);
    } catch (error) {
      console.warn('Failed to delete managed DNS record during tunnel delete:', error);
    }
  }
}

async function syncRow(row: {
  setting: typeof dnsSyncSettings.$inferSelect;
  tunnel: typeof tunnels.$inferSelect;
  zone: typeof dnsZones.$inferSelect;
  provider: typeof dnsProviders.$inferSelect;
}): Promise<SyncResult> {
  const recordName = row.tunnel.domain.toLowerCase();
  const zoneName = row.zone.name.toLowerCase();
  if (recordName !== zoneName && !recordName.endsWith(`.${zoneName}`)) {
    throw new Error(`Tunnel domain ${row.tunnel.domain} is outside DNS zone ${row.zone.name}`);
  }

  if (row.setting.recordType !== 'A') {
    throw new Error(`Unsupported DNS record type: ${row.setting.recordType}`);
  }

  const targetGateways = await getTargetGateways(row.setting.strategy as DNSSyncStrategy);
  if (targetGateways.length === 0) {
    throw new Error('No Gateway public IPs are available for DNS sync');
  }

  const provider = createDNSProvider(
    row.provider.type as DNSProviderType,
    decryptJson<DNSProviderConfig>(row.provider.encryptedConfig)
  );
  const remoteRecords = await provider.listRecords(
    row.zone.providerZoneId,
    recordName,
    row.setting.recordType as DNSRecordType
  );
  const managedRecords = await db
    .select()
    .from(dnsManagedRecords)
    .where(eq(dnsManagedRecords.syncSettingId, row.setting.id));

  const desiredRecords = targetGateways.map((gateway) => ({
    gateway,
    record: {
      name: recordName,
      type: 'A' as const,
      content: gateway.publicIp,
      ttl: row.setting.ttl,
      proxied: row.setting.proxied,
    },
  }));

  const claimedRemoteIds = new Set<string>();
  const activeManagedIds = new Set<string>();

  for (const desired of desiredRecords) {
    const managed = managedRecords.find((record) => record.gatewayId === desired.gateway.id);
    const managedRemote = managed
      ? remoteRecords.find((record) => record.id === managed.providerRecordId)
      : undefined;
    const remote =
      managedRemote ?? findReusableRemoteRecord(remoteRecords, claimedRemoteIds, desired.record);

    let syncedRecord: DNSRecord;
    if (remote) {
      claimedRemoteIds.add(remote.id);
      syncedRecord = await provider.updateRecord(row.zone.providerZoneId, remote.id, desired.record);
    } else {
      syncedRecord = await createOrAdoptRecord(
        provider,
        row.zone.providerZoneId,
        desired.record,
        claimedRemoteIds
      );
    }

    if (managed) {
      activeManagedIds.add(managed.id);
      await updateManagedRecord(managed.id, desired.gateway.id, syncedRecord);
    } else {
      const [created] = await db
        .insert(dnsManagedRecords)
        .values({
          syncSettingId: row.setting.id,
          gatewayId: desired.gateway.id,
          providerRecordId: syncedRecord.id,
          name: syncedRecord.name,
          type: syncedRecord.type,
          content: syncedRecord.content,
          ttl: syncedRecord.ttl,
          proxied: syncedRecord.proxied ?? false,
          lastSyncedAt: new Date(),
        })
        .returning();
      if (created) activeManagedIds.add(created.id);
    }
  }

  for (const managed of managedRecords) {
    if (activeManagedIds.has(managed.id)) continue;
    try {
      await provider.deleteRecord(row.zone.providerZoneId, managed.providerRecordId);
    } catch (error) {
      console.warn('Failed to delete stale DNS record:', error);
    }
    await db.delete(dnsManagedRecords).where(eq(dnsManagedRecords.id, managed.id));
  }

  return {
    synced: true,
    tunnelId: row.tunnel.id,
    recordName,
    desiredRecords: desiredRecords.length,
  };
}

async function getTargetGateways(strategy: DNSSyncStrategy): Promise<TargetGateway[]> {
  const rows = await db.select().from(gateways);
  const byIp = new Map<string, TargetGateway>();
  for (const gateway of rows) {
    if (strategy === 'online_gateways' && gateway.status !== 'online') continue;
    if (!gateway.publicIp || !isIPv4(gateway.publicIp)) continue;
    if (!byIp.has(gateway.publicIp)) {
      byIp.set(gateway.publicIp, { id: gateway.id, publicIp: gateway.publicIp });
    }
  }
  return Array.from(byIp.values());
}

function findReusableRemoteRecord(
  remoteRecords: DNSRecord[],
  claimedRemoteIds: Set<string>,
  desired: DesiredDNSRecord
): DNSRecord | undefined {
  return remoteRecords.find(
    (record) =>
      !claimedRemoteIds.has(record.id) &&
      record.name.toLowerCase() === desired.name.toLowerCase() &&
      record.type === desired.type &&
      record.content === desired.content
  );
}

async function createOrAdoptRecord(
  provider: DNSProvider,
  zoneId: string,
  desired: DesiredDNSRecord,
  claimedRemoteIds: Set<string>
): Promise<DNSRecord> {
  try {
    const created = await provider.createRecord(zoneId, desired);
    claimedRemoteIds.add(created.id);
    return created;
  } catch (error) {
    if (!isDuplicateRecordError(error)) throw error;

    const refreshedRecords = await provider.listRecords(zoneId, desired.name, desired.type);
    const reusable = findReusableRemoteRecord(refreshedRecords, claimedRemoteIds, desired);
    if (!reusable) throw error;

    claimedRemoteIds.add(reusable.id);
    return provider.updateRecord(zoneId, reusable.id, desired);
  }
}

function isDuplicateRecordError(error: unknown): boolean {
  return error instanceof Error && error.message.toLowerCase().includes('identical record already exists');
}

async function updateManagedRecord(id: string, gatewayId: string, record: DNSRecord) {
  await db
    .update(dnsManagedRecords)
    .set({
      gatewayId,
      providerRecordId: record.id,
      name: record.name,
      type: record.type,
      content: record.content,
      ttl: record.ttl,
      proxied: record.proxied ?? false,
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(dnsManagedRecords.id, id));
}

async function getProvider(providerId: string) {
  const [provider] = await db
    .select()
    .from(dnsProviders)
    .where(eq(dnsProviders.id, providerId))
    .limit(1);
  if (!provider) throw new Error('DNS provider not found');
  if (!provider.enabled) throw new Error('DNS provider is disabled');
  return provider;
}

function isIPv4(value: string): boolean {
  const parts = value.split('.');
  return (
    parts.length === 4 &&
    parts.every((part) => {
      if (!/^\d{1,3}$/.test(part)) return false;
      const n = Number(part);
      return n >= 0 && n <= 255;
    })
  );
}
