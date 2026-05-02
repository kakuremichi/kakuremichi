import { NextRequest } from 'next/server';
import { db, tunnels, tunnelBackends, tunnelTlsSettings, certificates, agents } from '@/lib/db';
import { getWebSocketServer } from '@/lib/ws';
import { deleteTunnelDnsRecords, syncTunnelDns } from '@/lib/dns/sync';
import { configureTunnelTls } from '@/lib/certificates/tunnel-tls';
import { updateTunnelSchema } from '@/lib/utils/validation';
import { eq } from 'drizzle-orm';
import { withAuth } from '@/lib/auth';
import { apiError, apiJson, apiOk, apiRouteError, readJsonBody } from '@/lib/api/response';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, 'read', async () => {
    try {
      const { id } = await params;
      const tunnel = await db.select().from(tunnels).where(eq(tunnels.id, id)).limit(1);
      const foundTunnel = tunnel[0];
      if (!foundTunnel) {
        return apiError('not_found', 'Tunnel not found', 404);
      }
      const tls = await getTunnelTls(id);
      const backends = await getTunnelBackends(id);
      return apiJson({ ...foundTunnel, backends, tls });
    } catch (error) {
      console.error('Failed to fetch tunnel:', error);
      return apiRouteError(error, 'Failed to fetch tunnel');
    }
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, 'write', async () => {
    try {
      const { id } = await params;
      const body = await readJsonBody(request);
      const validatedData = updateTunnelSchema.parse(body);
      const { tls, target, ...tunnelData } = validatedData;

      const updated = await db
        .update(tunnels)
        .set({ ...tunnelData, ...(target ? { target } : {}), updatedAt: new Date() })
        .where(eq(tunnels.id, id))
        .returning();

      const updatedTunnel = updated[0];
      if (!updatedTunnel) {
        return apiError('not_found', 'Tunnel not found', 404);
      }
      if (tls) {
        await configureTunnelTls(updatedTunnel.id, tls);
      }
      if (target) {
        const [primaryBackend] = await db
          .select({ id: tunnelBackends.id })
          .from(tunnelBackends)
          .where(eq(tunnelBackends.tunnelId, updatedTunnel.id))
          .limit(1);
        if (primaryBackend) {
          await db
            .update(tunnelBackends)
            .set({ target, updatedAt: new Date() })
            .where(eq(tunnelBackends.id, primaryBackend.id));
        }
      }

      try {
        await syncTunnelDns(updatedTunnel.id);
      } catch (err) {
        console.error('Failed to sync DNS after tunnel update:', err);
      }

      try {
        const wsServer = getWebSocketServer();
        if (wsServer) {
          await wsServer.broadcastGatewayConfig();
          await wsServer.broadcastAllAgentConfigs();
        }
      } catch (err) {
        console.error('Failed to broadcast tunnel update config:', err);
      }

      return apiJson({
        ...updatedTunnel,
        backends: await getTunnelBackends(updatedTunnel.id),
        tls: await getTunnelTls(updatedTunnel.id),
      });
    } catch (error) {
      console.error('Failed to update tunnel:', error);
      return apiRouteError(error, 'Failed to update tunnel');
    }
  });
}

async function getTunnelTls(tunnelId: string) {
  const [row] = await db
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
    .leftJoin(certificates, eq(tunnelTlsSettings.certificateId, certificates.id))
    .where(eq(tunnelTlsSettings.tunnelId, tunnelId))
    .limit(1);

  return row ?? {
    tunnelId,
    mode: 'disabled',
    forceHttps: false,
    certificate: null,
  };
}

async function getTunnelBackends(tunnelId: string) {
  return db
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
    .leftJoin(agents, eq(tunnelBackends.agentId, agents.id))
    .where(eq(tunnelBackends.tunnelId, tunnelId));
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, 'write', async () => {
    try {
      const { id } = await params;
      try {
        await deleteTunnelDnsRecords(id);
      } catch (err) {
        console.error('Failed to delete managed DNS records for tunnel:', err);
      }
      const deleted = await db.delete(tunnels).where(eq(tunnels.id, id)).returning();
      const deletedTunnel = deleted[0];
      if (!deletedTunnel) {
        return apiError('not_found', 'Tunnel not found', 404);
      }

      try {
        const wsServer = getWebSocketServer();
        if (wsServer) {
          await wsServer.broadcastGatewayConfig();
          await wsServer.broadcastAllAgentConfigs();
        }
      } catch (err) {
        console.error('Failed to broadcast tunnel delete config:', err);
      }

      return apiOk();
    } catch (error) {
      console.error('Failed to delete tunnel:', error);
      return apiRouteError(error, 'Failed to delete tunnel');
    }
  });
}
