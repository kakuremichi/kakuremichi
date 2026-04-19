import { NextRequest, NextResponse } from 'next/server';
import { db, tunnels, agents, tunnelGatewayIps, gateways } from '@/lib/db';
import { getWebSocketServer } from '@/lib/ws';
import { createTunnelSchema, allocateTunnelSubnetSync, allocateGatewayIpsForTunnel } from '@/lib/utils';
import { eq } from 'drizzle-orm';
import { withAuth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  return withAuth(request, 'read', async () => {
    try {
      const allTunnels = await db
        .select({
          id: tunnels.id,
          domain: tunnels.domain,
          agentId: tunnels.agentId,
          target: tunnels.target,
          enabled: tunnels.enabled,
          description: tunnels.description,
          subnet: tunnels.subnet,
          agentIp: tunnels.agentIp,
          httpProxyEnabled: tunnels.httpProxyEnabled,
          socksProxyEnabled: tunnels.socksProxyEnabled,
          createdAt: tunnels.createdAt,
          updatedAt: tunnels.updatedAt,
          agent: {
            id: agents.id,
            name: agents.name,
            status: agents.status,
          },
        })
        .from(tunnels)
        .leftJoin(agents, eq(tunnels.agentId, agents.id));

      const allGatewayIps = await db
        .select({
          tunnelId: tunnelGatewayIps.tunnelId,
          gatewayId: tunnelGatewayIps.gatewayId,
          gatewayName: gateways.name,
          ip: tunnelGatewayIps.ip,
        })
        .from(tunnelGatewayIps)
        .innerJoin(gateways, eq(tunnelGatewayIps.gatewayId, gateways.id));

      const gatewayIpsByTunnel = new Map<string, Array<{ gatewayId: string; gatewayName: string; ip: string }>>();
      for (const ip of allGatewayIps) {
        if (!gatewayIpsByTunnel.has(ip.tunnelId)) {
          gatewayIpsByTunnel.set(ip.tunnelId, []);
        }
        gatewayIpsByTunnel.get(ip.tunnelId)!.push({
          gatewayId: ip.gatewayId,
          gatewayName: ip.gatewayName,
          ip: ip.ip,
        });
      }

      const tunnelsWithGatewayIps = allTunnels.map(tunnel => ({
        ...tunnel,
        gatewayIps: gatewayIpsByTunnel.get(tunnel.id) || [],
      }));

      return NextResponse.json(tunnelsWithGatewayIps);
    } catch (error) {
      console.error('Failed to fetch tunnels:', error);
      return NextResponse.json({ error: 'Failed to fetch tunnels' }, { status: 500 });
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, 'write', async () => {
    try {
      const body = await request.json();
      const validatedData = createTunnelSchema.parse(body);

      const result = db.transaction((tx) => {
        const agentRow = tx
          .select({ id: agents.id })
          .from(agents)
          .where(eq(agents.id, validatedData.agentId))
          .limit(1)
          .all();
        if (agentRow.length === 0) {
          return { agentMissing: true as const };
        }

        const subnetAllocation = allocateTunnelSubnetSync(tx);

        const inserted = tx
          .insert(tunnels)
          .values({
            domain: validatedData.domain,
            agentId: validatedData.agentId,
            target: validatedData.target,
            description: validatedData.description,
            enabled: true,
            subnet: subnetAllocation.subnet,
            agentIp: subnetAllocation.agentIp,
            httpProxyEnabled: validatedData.httpProxyEnabled ?? false,
            socksProxyEnabled: validatedData.socksProxyEnabled ?? false,
          })
          .returning()
          .get();
        return { tunnel: inserted, subnet: subnetAllocation.subnet };
      });

      if ('agentMissing' in result) {
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
      }
      const createdTunnel = result.tunnel;
      if (createdTunnel) {
        await allocateGatewayIpsForTunnel(createdTunnel.id, result.subnet);
      }

      try {
        const wsServer = getWebSocketServer();
        if (wsServer) {
          await wsServer.broadcastGatewayConfig();
          if (createdTunnel?.agentId) {
            await wsServer.broadcastAgentConfig(createdTunnel.agentId);
          }
        } else {
          console.warn('WebSocket server not initialized, cannot broadcast config');
        }
      } catch (err) {
        console.error('Failed to broadcast tunnel creation config:', err);
      }

      return NextResponse.json(createdTunnel, { status: 201 });
    } catch (error) {
      console.error('Failed to create tunnel:', error);
      if (error instanceof Error && 'issues' in error) {
        return NextResponse.json({ error: 'Validation failed', details: error }, { status: 400 });
      }
      return NextResponse.json({ error: 'Failed to create tunnel' }, { status: 500 });
    }
  });
}
