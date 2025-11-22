import { db, agents } from '../db';
import { sql } from 'drizzle-orm';

/**
 * Get the next available subnet for a new Agent
 * Each Agent gets its own /24 subnet: 10.1.0.0/24, 10.2.0.0/24, etc.
 * @returns Next available subnet in CIDR format
 */
export async function getNextSubnet(): Promise<string> {
  // Get all existing subnets
  const existingAgents = await db.select({ subnet: agents.subnet }).from(agents);

  if (existingAgents.length === 0) {
    return '10.1.0.0/24';
  }

  // Extract subnet numbers (10.X.0.0/24 -> X)
  const usedNumbers = existingAgents
    .map((agent) => {
      // subnet is NOT NULL in the schema, safe to assert
      const subnet = agent.subnet as string;
      const match = subnet.match(/^10\.(\d+)\.0\.0\/24$/);
      return match && match[1] ? parseInt(match[1], 10) : 0;
    })
    .filter((num) => num > 0);

  // Find the next available number
  const maxNumber = Math.max(...usedNumbers);
  const nextNumber = maxNumber + 1;

  if (nextNumber > 254) {
    throw new Error('Subnet limit reached (max: 10.254.0.0/24)');
  }

  return `10.${nextNumber}.0.0/24`;
}

/**
 * Get the virtual IP for an Agent based on its subnet
 * Agent always gets .100 in its subnet
 * @param subnet Subnet in CIDR format (e.g., "10.1.0.0/24")
 * @returns Virtual IP address
 */
export function getVirtualIpFromSubnet(subnet: string): string {
  const match = subnet.match(/^(10\.\d+\.0)\.\d+\/24$/);
  if (!match) {
    throw new Error('Invalid subnet format');
  }

  return `${match[1]}.100`;
}

/**
 * Get the Gateway IPs for a given subnet
 * Gateways get .1, .2, .3, etc. in the Agent's subnet
 * @param subnet Subnet in CIDR format
 * @param gatewayIndex Gateway index (0-based)
 * @returns Gateway IP address in this subnet
 */
export function getGatewayIpInSubnet(subnet: string, gatewayIndex: number): string {
  const match = subnet.match(/^(10\.\d+\.0)\.\d+\/24$/);
  if (!match) {
    throw new Error('Invalid subnet format');
  }

  const gatewayIp = gatewayIndex + 1; // .1, .2, .3, ...
  if (gatewayIp < 1 || gatewayIp > 99) {
    throw new Error('Gateway index out of range (max: 99)');
  }

  return `${match[1]}.${gatewayIp}`;
}
