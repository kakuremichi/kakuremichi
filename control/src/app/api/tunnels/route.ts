import { NextRequest } from 'next/server';
import {
  db,
  tunnels,
  agents,
  tunnelGatewayIps,
  gateways,
  dnsProviders,
  dnsSyncSettings,
  dnsZones,
} from '@/lib/db';
import { getWebSocketServer } from '@/lib/ws';
import { createTunnelSchema, allocateTunnelSubnetSync, allocateGatewayIpsForTunnel } from '@/lib/utils';
import { syncTunnelDns } from '@/lib/dns/sync';
import { eq } from 'drizzle-orm';
import { withAuth } from '@/lib/auth';
import { apiCreated, apiError, apiJson, apiRouteError, readJsonBody } from '@/lib/api/response';

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

      const allDnsSettings = await db
        .select({
          tunnelId: dnsSyncSettings.tunnelId,
          enabled: dnsSyncSettings.enabled,
          recordType: dnsSyncSettings.recordType,
          strategy: dnsSyncSettings.strategy,
          ttl: dnsSyncSettings.ttl,
          proxied: dnsSyncSettings.proxied,
          lastSyncAt: dnsSyncSettings.lastSyncAt,
          lastError: dnsSyncSettings.lastError,
          zone: {
            id: dnsZones.id,
            name: dnsZones.name,
          },
          provider: {
            id: dnsProviders.id,
            name: dnsProviders.name,
            type: dnsProviders.type,
          },
        })
        .from(dnsSyncSettings)
        .innerJoin(dnsZones, eq(dnsSyncSettings.zoneId, dnsZones.id))
        .innerJoin(dnsProviders, eq(dnsZones.providerId, dnsProviders.id));

      const dnsSyncByTunnel = new Map(allDnsSettings.map((setting) => [setting.tunnelId, setting]));

      const tunnelsWithGatewayIps = allTunnels.map(tunnel => ({
        ...tunnel,
        gatewayIps: gatewayIpsByTunnel.get(tunnel.id) || [],
        dnsSync: dnsSyncByTunnel.get(tunnel.id) || null,
      }));

      return apiJson(tunnelsWithGatewayIps);
    } catch (error) {
      console.error('Failed to fetch tunnels:', error);
      return apiRouteError(error, 'Failed to fetch tunnels');
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, 'write', async () => {
    try {
      const body = await readJsonBody(request);
      const validatedData = createTunnelSchema.parse(body);

      if (validatedData.dnsSync?.enabled) {
        const zone = await db
          .select({ id: dnsZones.id })
          .from(dnsZones)
          .where(eq(dnsZones.id, validatedData.dnsSync.zoneId))
          .limit(1);
        if (zone.length === 0) {
          return apiError('not_found', 'DNS zone not found', 404);
        }
      }

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

        if (validatedData.dnsSync?.enabled) {
          tx.insert(dnsSyncSettings)
            .values({
              tunnelId: inserted.id,
              zoneId: validatedData.dnsSync.zoneId,
              enabled: validatedData.dnsSync.enabled,
              recordType: validatedData.dnsSync.recordType,
              strategy: validatedData.dnsSync.strategy,
              ttl: validatedData.dnsSync.ttl,
              proxied: validatedData.dnsSync.proxied,
            })
            .run();
        }

        return { tunnel: inserted, subnet: subnetAllocation.subnet };
      });

      if ('agentMissing' in result) {
        return apiError('not_found', 'Agent not found', 404);
      }
      const createdTunnel = result.tunnel;
      if (createdTunnel) {
        await allocateGatewayIpsForTunnel(createdTunnel.id, result.subnet);
        if (validatedData.dnsSync?.enabled) {
          try {
            await syncTunnelDns(createdTunnel.id);
          } catch (err) {
            console.error('Failed to sync DNS for new tunnel:', err);
          }
        }
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

      return apiCreated(createdTunnel);
    } catch (error) {
      console.error('Failed to create tunnel:', error);
      return apiRouteError(error, 'Failed to create tunnel');
    }
  });
}
