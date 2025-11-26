import { db, tunnels } from '../db';
import { isNotNull } from 'drizzle-orm';

/**
 * Subnet allocation result for a Tunnel
 */
export interface TunnelSubnetAllocation {
  subnet: string;    // e.g., "10.1.0.0/24"
  gatewayIp: string; // e.g., "10.1.0.1"
  agentIp: string;   // e.g., "10.1.0.100"
}

/**
 * Allocate a new subnet for a Tunnel
 * Each Tunnel gets its own /24 subnet: 10.1.0.0/24, 10.2.0.0/24, etc.
 * @returns Subnet allocation with subnet, gatewayIp, and agentIp
 */
export async function allocateTunnelSubnet(): Promise<TunnelSubnetAllocation> {
  // Get all existing subnets from tunnels
  const existingTunnels = await db
    .select({ subnet: tunnels.subnet })
    .from(tunnels)
    .where(isNotNull(tunnels.subnet));

  // Extract subnet numbers (10.X.0.0/24 -> X)
  const usedNumbers = new Set<number>();
  for (const tunnel of existingTunnels) {
    if (tunnel.subnet) {
      const match = tunnel.subnet.match(/^10\.(\d+)\.0\.0\/24$/);
      if (match && match[1]) {
        usedNumbers.add(parseInt(match[1], 10));
      }
    }
  }

  // Find the next available number (start from 1)
  let nextNumber = 1;
  while (usedNumbers.has(nextNumber) && nextNumber <= 254) {
    nextNumber++;
  }

  if (nextNumber > 254) {
    throw new Error('Subnet limit reached (max: 254 tunnels)');
  }

  return {
    subnet: `10.${nextNumber}.0.0/24`,
    gatewayIp: `10.${nextNumber}.0.1`,
    agentIp: `10.${nextNumber}.0.100`,
  };
}

/**
 * Parse a subnet and extract its components
 * @param subnet Subnet in CIDR format (e.g., "10.1.0.0/24")
 * @returns Parsed subnet info or null if invalid
 */
export function parseSubnet(subnet: string): { number: number; gatewayIp: string; agentIp: string } | null {
  const match = subnet.match(/^10\.(\d+)\.0\.0\/24$/);
  if (!match || !match[1]) {
    return null;
  }

  const num = parseInt(match[1], 10);
  return {
    number: num,
    gatewayIp: `10.${num}.0.1`,
    agentIp: `10.${num}.0.100`,
  };
}

/**
 * Validate a subnet format
 * @param subnet Subnet string to validate
 * @returns true if valid
 */
export function isValidSubnet(subnet: string): boolean {
  return /^10\.\d{1,3}\.0\.0\/24$/.test(subnet);
}
