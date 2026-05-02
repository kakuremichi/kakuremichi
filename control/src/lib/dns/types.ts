export type DNSProviderType = 'cloudflare';
export type DNSRecordType = 'A';
export type DNSSyncStrategy = 'all_gateways' | 'online_gateways';

export interface DNSProviderConfig {
  apiToken: string;
}

export interface DNSZone {
  id: string;
  name: string;
}

export interface DNSRecord {
  id: string;
  name: string;
  type: DNSRecordType;
  content: string;
  ttl: number;
  proxied?: boolean;
}

export interface DesiredDNSRecord {
  name: string;
  type: DNSRecordType;
  content: string;
  ttl: number;
  proxied: boolean;
}

export interface DNSProvider {
  validateCredentials(): Promise<void>;
  listZones(): Promise<DNSZone[]>;
  listRecords(zoneId: string, name: string, type: DNSRecordType): Promise<DNSRecord[]>;
  createRecord(zoneId: string, record: DesiredDNSRecord): Promise<DNSRecord>;
  updateRecord(zoneId: string, recordId: string, record: DesiredDNSRecord): Promise<DNSRecord>;
  deleteRecord(zoneId: string, recordId: string): Promise<void>;
}

export interface SyncResult {
  synced: boolean;
  tunnelId: string;
  recordName?: string;
  desiredRecords?: number;
  message?: string;
}
