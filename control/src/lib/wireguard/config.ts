import { db, agents, gateways, tunnels } from '../db';
import { eq, isNotNull } from 'drizzle-orm';

/**
 * Generate WireGuard configuration for a Gateway
 * @param gatewayId Gateway ID
 * @returns WireGuard configuration string
 */
export async function generateGatewayWireguardConfig(
  gatewayId: string
): Promise<string> {
  // Get gateway info
  const gateway = await db
    .select()
    .from(gateways)
    .where(eq(gateways.id, gatewayId))
    .limit(1);

  if (gateway.length === 0) {
    throw new Error('Gateway not found');
  }

  const gw = gateway[0]!;

  // Get all tunnels with their subnet info
  const allTunnels = await db
    .select()
    .from(tunnels)
    .where(isNotNull(tunnels.subnet));

  // Get all agents for peer info
  const allAgents = await db.select().from(agents);
  const agentMap = new Map(allAgents.map(a => [a.id, a]));

  // Build WireGuard config
  let config = `[Interface]\n`;
  config += `# Gateway: ${gw.name}\n`;
  config += `PrivateKey = <GATEWAY_PRIVATE_KEY>\n`;
  config += `ListenPort = 51820\n`;

  // Add addresses for all tunnel subnets (gateway gets gatewayIp)
  const addresses = allTunnels
    .filter(t => t.gatewayIp && t.subnet)
    .map(t => {
      const subnetMatch = t.subnet!.match(/\/(\d+)$/);
      const prefix = subnetMatch ? subnetMatch[1] : '24';
      return `${t.gatewayIp}/${prefix}`;
    });

  if (addresses.length > 0) {
    config += `Address = ${addresses.join(', ')}\n`;
  }
  config += `\n`;

  // Group tunnels by agent and create peers
  const tunnelsByAgent = new Map<string, typeof allTunnels>();
  for (const tunnel of allTunnels) {
    if (!tunnelsByAgent.has(tunnel.agentId)) {
      tunnelsByAgent.set(tunnel.agentId, []);
    }
    tunnelsByAgent.get(tunnel.agentId)!.push(tunnel);
  }

  // Add peers (Agents) with their allowed IPs from tunnels
  for (const [agentId, agentTunnels] of tunnelsByAgent) {
    const agent = agentMap.get(agentId);
    if (!agent?.wireguardPublicKey) continue;

    const allowedIPs = agentTunnels
      .filter(t => t.agentIp)
      .map(t => `${t.agentIp}/32`);

    if (allowedIPs.length === 0) continue;

    config += `[Peer]\n`;
    config += `# Agent: ${agent.name}\n`;
    config += `PublicKey = ${agent.wireguardPublicKey}\n`;
    config += `AllowedIPs = ${allowedIPs.join(', ')}\n`;
    config += `\n`;
  }

  return config;
}

/**
 * Generate WireGuard configuration for an Agent
 * @param agentId Agent ID
 * @returns WireGuard configuration string
 */
export async function generateAgentWireguardConfig(
  agentId: string
): Promise<string> {
  // Get agent info
  const agent = await db
    .select()
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  if (agent.length === 0) {
    throw new Error('Agent not found');
  }

  const ag = agent[0]!;

  // Get all tunnels for this agent
  const agentTunnels = await db
    .select()
    .from(tunnels)
    .where(eq(tunnels.agentId, agentId));

  // Get all gateways to create peers
  const allGateways = await db.select().from(gateways);

  // Collect virtual IPs from tunnels
  const virtualIPs = agentTunnels
    .filter(t => t.agentIp && t.subnet)
    .map(t => {
      const subnetMatch = t.subnet!.match(/\/(\d+)$/);
      const prefix = subnetMatch ? subnetMatch[1] : '24';
      return `${t.agentIp}/${prefix}`;
    });

  // Build WireGuard config
  let config = `[Interface]\n`;
  config += `# Agent: ${ag.name}\n`;
  config += `PrivateKey = <AGENT_PRIVATE_KEY>\n`;
  if (virtualIPs.length > 0) {
    config += `Address = ${virtualIPs.join(', ')}\n`;
  }
  config += `\n`;

  // Collect gateway IPs from tunnels
  const gatewayIPs = agentTunnels
    .filter(t => t.gatewayIp)
    .map(t => `${t.gatewayIp}/32`);

  // Add peers (Gateways)
  for (const gateway of allGateways) {
    config += `[Peer]\n`;
    config += `# Gateway: ${gateway.name}\n`;
    config += `PublicKey = ${gateway.wireguardPublicKey}\n`;
    config += `Endpoint = ${gateway.publicIp}:51820\n`;
    if (gatewayIPs.length > 0) {
      config += `AllowedIPs = ${gatewayIPs.join(', ')}\n`;
    }
    config += `PersistentKeepalive = 25\n`;
    config += `\n`;
  }

  return config;
}

/**
 * Get WireGuard configuration data for Gateway (structured)
 */
export async function getGatewayWireguardData(gatewayId: string) {
  const gateway = await db
    .select()
    .from(gateways)
    .where(eq(gateways.id, gatewayId))
    .limit(1);

  if (gateway.length === 0) {
    throw new Error('Gateway not found');
  }

  // Get all tunnels with subnet info
  const allTunnels = await db
    .select()
    .from(tunnels)
    .where(isNotNull(tunnels.subnet));

  // Get all agents for peer info
  const allAgents = await db.select().from(agents);
  const agentMap = new Map(allAgents.map(a => [a.id, a]));

  // Group tunnels by agent
  const tunnelsByAgent = new Map<string, typeof allTunnels>();
  for (const tunnel of allTunnels) {
    if (!tunnelsByAgent.has(tunnel.agentId)) {
      tunnelsByAgent.set(tunnel.agentId, []);
    }
    tunnelsByAgent.get(tunnel.agentId)!.push(tunnel);
  }

  // Build peers with allowed IPs from tunnels
  const peers = [];
  for (const [agentId, agentTunnels] of tunnelsByAgent) {
    const agent = agentMap.get(agentId);
    if (!agent) continue;

    const allowedIPs = agentTunnels
      .filter(t => t.agentIp)
      .map(t => `${t.agentIp}/32`);

    peers.push({
      publicKey: agent.wireguardPublicKey,
      allowedIPs: allowedIPs.join(', '),
      name: agent.name,
    });
  }

  return {
    gateway: gateway[0]!,
    peers,
  };
}

/**
 * Get WireGuard configuration data for Agent (structured)
 */
export async function getAgentWireguardData(agentId: string) {
  const agent = await db
    .select()
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  if (agent.length === 0) {
    throw new Error('Agent not found');
  }

  const ag = agent[0]!;

  // Get all tunnels for this agent
  const agentTunnels = await db
    .select()
    .from(tunnels)
    .where(eq(tunnels.agentId, agentId));

  const allGateways = await db.select().from(gateways);

  // Collect gateway IPs from tunnels
  const gatewayIPs = agentTunnels
    .filter(t => t.gatewayIp)
    .map(t => `${t.gatewayIp}/32`);

  return {
    agent: ag,
    virtualIPs: agentTunnels
      .filter(t => t.agentIp)
      .map(t => t.agentIp),
    peers: allGateways.map((gateway) => ({
      publicKey: gateway.wireguardPublicKey,
      endpoint: `${gateway.publicIp}:51820`,
      allowedIPs: gatewayIPs.join(', '),
      name: gateway.name,
    })),
  };
}
