import type { Agent, Gateway } from '@/lib/db';

export interface ApiKeyOptions {
  includeApiKey?: boolean;
}

function keyPrefix(apiKey: string | null | undefined): string | null {
  return apiKey ? apiKey.slice(0, 8) : null;
}

export type AgentResource = Omit<Agent, 'apiKey'> & {
  apiKeyPrefix: string | null;
  apiKey?: string;
};

export type GatewayResource = Omit<Gateway, 'apiKey'> & {
  apiKeyPrefix: string | null;
  apiKey?: string;
};

export function agentResource(agent: Agent, options: ApiKeyOptions = {}): AgentResource {
  const { apiKey, ...safeAgent } = agent;
  return {
    ...safeAgent,
    apiKeyPrefix: keyPrefix(apiKey),
    ...(options.includeApiKey ? { apiKey } : {}),
  };
}

export function gatewayResource(gateway: Gateway, options: ApiKeyOptions = {}): GatewayResource {
  const { apiKey, ...safeGateway } = gateway;
  return {
    ...safeGateway,
    apiKeyPrefix: keyPrefix(apiKey),
    ...(options.includeApiKey ? { apiKey } : {}),
  };
}
