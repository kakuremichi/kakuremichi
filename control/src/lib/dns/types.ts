export const DNS_PROVIDER_TYPES = ['cloudflare'] as const;
export type DNSProviderType = (typeof DNS_PROVIDER_TYPES)[number];

export const DNS_RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'TXT'] as const;
export type DNSRecordType = (typeof DNS_RECORD_TYPES)[number];
export type DNSSyncStrategy = 'all_gateways' | 'online_gateways';

export interface DNSProviderConfig {
  apiToken?: string;
  [key: string]: unknown;
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
  proxied?: boolean;
}

export interface DNSProviderCapabilities {
  supportedRecordTypes: DNSRecordType[];
  proxiedRecordTypes: DNSRecordType[];
  supportsCredentialsValidation: boolean;
  supportsZoneImport: boolean;
}

export interface DNSProvider {
  getCapabilities(): DNSProviderCapabilities;
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
