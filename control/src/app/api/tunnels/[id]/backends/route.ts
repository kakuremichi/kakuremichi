import { NextRequest } from 'next/server';
import { db, agents, tunnels, tunnelBackends } from '@/lib/db';
import { getWebSocketServer } from '@/lib/ws';
import { allocateTunnelBackendIpSync, createTunnelBackendSchema } from '@/lib/utils';
import { eq } from 'drizzle-orm';
import { withAuth } from '@/lib/auth';
import { apiCreated, apiError, apiJson, apiRouteError, readJsonBody } from '@/lib/api/response';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, 'read', async () => {
    try {
      const { id } = await params;
      return apiJson(await listBackends(id));
    } catch (error) {
      console.error('Failed to list tunnel backends:', error);
      return apiRouteError(error, 'Failed to list tunnel backends');
    }
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, 'write', async () => {
    try {
      const { id } = await params;
      const body = await readJsonBody(request);
      const validatedData = createTunnelBackendSchema.parse(body);

      const result = db.transaction((tx) => {
        const [tunnel] = tx.select().from(tunnels).where(eq(tunnels.id, id)).limit(1).all();
        if (!tunnel) return { tunnelMissing: true as const };
        if (!tunnel.subnet) return { subnetMissing: true as const };

        const [agent] = tx.select({ id: agents.id }).from(agents).where(eq(agents.id, validatedData.agentId)).limit(1).all();
        if (!agent) return { agentMissing: true as const };

        const agentIp = allocateTunnelBackendIpSync(tx, tunnel.id, tunnel.subnet);
        const backend = tx
          .insert(tunnelBackends)
          .values({
            tunnelId: tunnel.id,
            agentId: validatedData.agentId,
            target: validatedData.target,
            enabled: validatedData.enabled,
            draining: validatedData.draining,
            weight: validatedData.weight,
            priority: validatedData.priority,
            agentIp,
          })
          .returning()
          .get();

        return { backend };
      });

      if ('tunnelMissing' in result) return apiError('not_found', 'Tunnel not found', 404);
      if ('subnetMissing' in result) return apiError('invalid_state', 'Tunnel has no subnet', 409);
      if ('agentMissing' in result) return apiError('not_found', 'Agent not found', 404);

      await broadcastConfig();
      return apiCreated(result.backend);
    } catch (error) {
      console.error('Failed to create tunnel backend:', error);
      return apiRouteError(error, 'Failed to create tunnel backend');
    }
  });
}

async function listBackends(tunnelId: string) {
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

async function broadcastConfig() {
  const wsServer = getWebSocketServer();
  if (!wsServer) return;
  await wsServer.broadcastGatewayConfig();
  await wsServer.broadcastAllAgentConfigs();
}
