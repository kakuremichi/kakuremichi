import { CloudflareDNSProvider } from './cloudflare';
import type { DNSProvider, DNSProviderConfig, DNSProviderType } from '../types';

export function createDNSProvider(type: DNSProviderType, config: DNSProviderConfig): DNSProvider {
  switch (type) {
    case 'cloudflare':
      return new CloudflareDNSProvider(config);
    default:
      throw new Error(`Unsupported DNS provider type: ${type}`);
  }
}
