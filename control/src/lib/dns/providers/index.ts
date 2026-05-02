import { CloudflareDNSProvider, cloudflareCapabilities } from './cloudflare';
import type {
  DNSProvider,
  DNSProviderCapabilities,
  DNSProviderConfig,
  DNSProviderType,
} from '../types';

export function createDNSProvider(type: DNSProviderType, config: DNSProviderConfig): DNSProvider {
  switch (type) {
    case 'cloudflare':
      return new CloudflareDNSProvider(config);
    default:
      throw new Error(`Unsupported DNS provider type: ${type}`);
  }
}

export function getDNSProviderCapabilities(type: DNSProviderType): DNSProviderCapabilities {
  switch (type) {
    case 'cloudflare':
      return cloudflareCapabilities;
    default:
      throw new Error(`Unsupported DNS provider type: ${type}`);
  }
}
