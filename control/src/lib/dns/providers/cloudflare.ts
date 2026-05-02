import type {
  DNSProvider,
  DNSProviderConfig,
  DNSRecord,
  DNSRecordType,
  DNSZone,
  DesiredDNSRecord,
} from '../types';

interface CloudflareResponse<T> {
  success: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  result: T;
  result_info?: {
    page: number;
    total_pages: number;
  };
}

interface CloudflareZone {
  id: string;
  name: string;
}

interface CloudflareRecord {
  id: string;
  name: string;
  type: DNSRecordType;
  content: string;
  ttl: number;
  proxied?: boolean;
}

export class CloudflareDNSProvider implements DNSProvider {
  private readonly apiToken: string;
  private readonly baseUrl = 'https://api.cloudflare.com/client/v4';

  constructor(config: DNSProviderConfig) {
    this.apiToken = config.apiToken;
  }

  async validateCredentials(): Promise<void> {
    await this.request('/user/tokens/verify');
  }

  async listZones(): Promise<DNSZone[]> {
    const zones: DNSZone[] = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const response = await this.request<CloudflareZone[]>(
        `/zones?${new URLSearchParams({ page: String(page), per_page: '50' })}`
      );
      zones.push(...response.result.map((zone) => ({ id: zone.id, name: zone.name })));
      totalPages = response.result_info?.total_pages ?? 1;
      page++;
    }

    return zones;
  }

  async listRecords(zoneId: string, name: string, type: DNSRecordType): Promise<DNSRecord[]> {
    const params = new URLSearchParams({
      name,
      type,
      per_page: '100',
    });
    const response = await this.request<CloudflareRecord[]>(
      `/zones/${encodeURIComponent(zoneId)}/dns_records?${params}`
    );
    return response.result.map(toDNSRecord);
  }

  async createRecord(zoneId: string, record: DesiredDNSRecord): Promise<DNSRecord> {
    const response = await this.request<CloudflareRecord>(
      `/zones/${encodeURIComponent(zoneId)}/dns_records`,
      {
        method: 'POST',
        body: JSON.stringify(toCloudflareRecord(record)),
      }
    );
    return toDNSRecord(response.result);
  }

  async updateRecord(zoneId: string, recordId: string, record: DesiredDNSRecord): Promise<DNSRecord> {
    const response = await this.request<CloudflareRecord>(
      `/zones/${encodeURIComponent(zoneId)}/dns_records/${encodeURIComponent(recordId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(toCloudflareRecord(record)),
      }
    );
    return toDNSRecord(response.result);
  }

  async deleteRecord(zoneId: string, recordId: string): Promise<void> {
    await this.request(`/zones/${encodeURIComponent(zoneId)}/dns_records/${encodeURIComponent(recordId)}`, {
      method: 'DELETE',
    });
  }

  private async request<T = unknown>(
    path: string,
    init: RequestInit = {}
  ): Promise<CloudflareResponse<T>> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });

    const body = (await response.json().catch(() => null)) as CloudflareResponse<T> | null;
    if (!response.ok || !body?.success) {
      const message =
        body?.errors?.map((err) => err.message || `Cloudflare error ${err.code}`).join(', ') ||
        `Cloudflare API request failed with HTTP ${response.status}`;
      throw new Error(message);
    }
    return body;
  }
}

function toCloudflareRecord(record: DesiredDNSRecord) {
  return {
    type: record.type,
    name: record.name,
    content: record.content,
    ttl: record.ttl,
    proxied: record.proxied,
  };
}

function toDNSRecord(record: CloudflareRecord): DNSRecord {
  return {
    id: record.id,
    name: record.name,
    type: record.type,
    content: record.content,
    ttl: record.ttl,
    proxied: record.proxied ?? false,
  };
}
