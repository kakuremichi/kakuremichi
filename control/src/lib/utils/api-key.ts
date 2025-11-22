import { randomBytes } from 'crypto';

/**
 * Generate a random API key with a prefix
 * @param prefix Prefix for the API key (e.g., 'agt_' for Agent, 'gtw_' for Gateway)
 * @param length Length of the random part (default: 32)
 * @returns API key string
 */
export function generateApiKey(prefix: string, length: number = 32): string {
  const randomPart = randomBytes(length)
    .toString('base64')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, length);

  return `${prefix}${randomPart}`;
}

/**
 * Generate an Agent API key
 */
export function generateAgentApiKey(): string {
  return generateApiKey('agt_');
}

/**
 * Generate a Gateway API key
 */
export function generateGatewayApiKey(): string {
  return generateApiKey('gtw_');
}
