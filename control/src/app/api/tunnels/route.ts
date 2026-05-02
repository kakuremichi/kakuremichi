import { NextRequest } from 'next/server';
import {
  db,
  tunnels,
  tunnelBackends,
  agents,
  tunnelGatewayIps,
  gateways,
  dnsProviders,
  dnsSyncSettings,
  dnsZones,
  certificates,
  tunnelTlsSettings,
} from '@/lib/db';
import { getWebSocketServer } from '@/lib/ws';
import {
  createTunnelSchema,
  allocateTunnelSubnetSync,
  allocateGatewayIpsForTunnel,
  allocateTunnelBackendIpSync,
} from '@/lib/utils';
import { syncTunnelDns } from '@/lib/dns/sync';
import { configureTunnelTls } from '@/lib/certificates/tunnel-tls';
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

      const allBackends = await db
        .select({
          id: tunnelBackends.id,
          tunnelId: tunnelBackends.tunnelId,
          agentId: tunnelBackends.agentId,
          target: tunnelBackends.target,
          enabled: tunnelBackends.enabled,
          draining: tunnelBackends.draining,
          weight: tunnelBackends.weight,
          priority: tunnelBackends.priority,
          agentIp: tunnelBackends.agentIp,
          status: tunnelBackends.status,
          lastError: tunnelBackends.lastError,
          createdAt: tunnelBackends.createdAt,
          updatedAt: tunnelBackends.updatedAt,
          agent: {
            id: agents.id,
            name: agents.name,
            status: agents.status,
          },
        })
        .from(tunnelBackends)
        .leftJoin(agents, eq(tunnelBackends.agentId, agents.id));

      const backendsByTunnel = new Map<string, typeof allBackends>();
      for (const backend of allBackends) {
        if (!backendsByTunnel.has(backend.tunnelId)) {
          backendsByTunnel.set(backend.tunnelId, []);
        }
        backendsByTunnel.get(backend.tunnelId)!.push(backend);
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

      const allTlsSettings = await db
        .select({
          tunnelId: tunnelTlsSettings.tunnelId,
          mode: tunnelTlsSettings.mode,
          forceHttps: tunnelTlsSettings.forceHttps,
          certificate: {
            id: certificates.id,
            domain: certificates.domain,
            status: certificates.status,
            notAfter: certificates.notAfter,
            renewAfter: certificates.renewAfter,
            lastIssuedAt: certificates.lastIssuedAt,
            lastError: certificates.lastError,
            dnsZoneId: certificates.dnsZoneId,
          },
        })
        .from(tunnelTlsSettings)
        .leftJoin(certificates, eq(tunnelTlsSettings.certificateId, certificates.id));

      const tlsByTunnel = new Map(allTlsSettings.map((setting) => [setting.tunnelId, setting]));

      const tunnelsWithGatewayIps = allTunnels.map(tunnel => ({
        ...tunnel,
        backends: backendsByTunnel.get(tunnel.id) || [],
        gatewayIps: gatewayIpsByTunnel.get(tunnel.id) || [],
        dnsSync: dnsSyncByTunnel.get(tunnel.id) || null,
        tls: tlsByTunnel.get(tunnel.id) || {
          tunnelId: tunnel.id,
          mode: 'disabled',
          forceHttps: false,
          certificate: null,
        },
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
      const backendInputs = validatedData.backends ?? [{
        agentId: validatedData.agentId!,
        target: validatedData.target!,
        enabled: true,
        draining: false,
        weight: 100,
        priority: 0,
      }];

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
        const existingAgents = tx
          .select({ id: agents.id })
          .from(agents)
          .all();
        const existingAgentIds = new Set(existingAgents.map((agent) => agent.id));
        const missingAgentId = backendInputs.find((backend) => !existingAgentIds.has(backend.agentId))?.agentId;
        if (missingAgentId) {
          return { agentMissing: true as const, agentId: missingAgentId };
        }

        const subnetAllocation = allocateTunnelSubnetSync(tx);
        const primaryBackend = backendInputs[0]!;

        const inserted = tx
          .insert(tunnels)
          .values({
            domain: validatedData.domain,
            agentId: primaryBackend.agentId,
            target: primaryBackend.target,
            description: validatedData.description,
            enabled: true,
            subnet: subnetAllocation.subnet,
            agentIp: subnetAllocation.agentIp,
            httpProxyEnabled: validatedData.httpProxyEnabled ?? false,
            socksProxyEnabled: validatedData.socksProxyEnabled ?? false,
          })
          .returning()
          .get();

        for (let index = 0; index < backendInputs.length; index++) {
          const backend = backendInputs[index]!;
          const agentIp = index === 0
            ? subnetAllocation.agentIp
            : allocateTunnelBackendIpSync(tx, inserted.id, subnetAllocation.subnet);
          tx.insert(tunnelBackends)
            .values({
              tunnelId: inserted.id,
              agentId: backend.agentId,
              target: backend.target,
              enabled: backend.enabled,
              draining: backend.draining,
              weight: backend.weight,
              priority: backend.priority,
              agentIp,
            })
            .run();
        }

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
        return apiError('not_found', `Agent not found: ${result.agentId}`, 404);
      }
      const createdTunnel = result.tunnel;
      if (createdTunnel) {
        if (validatedData.tls) {
          await configureTunnelTls(createdTunnel.id, validatedData.tls);
        }
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
          await wsServer.broadcastAllAgentConfigs();
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
