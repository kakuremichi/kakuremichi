import { NextRequest } from 'next/server';
import { db, agents, tunnels, tunnelBackends } from '@/lib/db';
import { getWebSocketServer } from '@/lib/ws';
import { updateTunnelBackendSchema } from '@/lib/utils';
import { and, eq } from 'drizzle-orm';
import { withAuth } from '@/lib/auth';
import { apiError, apiJson, apiOk, apiRouteError, readJsonBody } from '@/lib/api/response';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; backendId: string }> }
) {
  return withAuth(request, 'write', async () => {
    try {
      const { id, backendId } = await params;
      const body = await readJsonBody(request);
      const validatedData = updateTunnelBackendSchema.parse(body);

      if (validatedData.agentId) {
        const [agent] = await db
          .select({ id: agents.id })
          .from(agents)
          .where(eq(agents.id, validatedData.agentId))
          .limit(1);
        if (!agent) {
          return apiError('not_found', 'Agent not found', 404);
        }
      }

      const updated = await db
        .update(tunnelBackends)
        .set({ ...validatedData, updatedAt: new Date() })
        .where(and(eq(tunnelBackends.id, backendId), eq(tunnelBackends.tunnelId, id)))
        .returning();

      const backend = updated[0];
      if (!backend) {
        return apiError('not_found', 'Backend not found', 404);
      }

      await syncLegacyTunnelPrimary(id);
      await broadcastConfig();
      return apiJson(backend);
    } catch (error) {
      console.error('Failed to update tunnel backend:', error);
      return apiRouteError(error, 'Failed to update tunnel backend');
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; backendId: string }> }
) {
  return withAuth(request, 'write', async () => {
    try {
      const { id, backendId } = await params;
      const backends = await db
        .select({ id: tunnelBackends.id })
        .from(tunnelBackends)
        .where(eq(tunnelBackends.tunnelId, id));

      if (!backends.some((backend) => backend.id === backendId)) {
        return apiError('not_found', 'Backend not found', 404);
      }
      if (backends.length <= 1) {
        return apiError('invalid_state', 'A tunnel must keep at least one backend', 409);
      }

      await db.delete(tunnelBackends).where(eq(tunnelBackends.id, backendId));
      await syncLegacyTunnelPrimary(id);
      await broadcastConfig();
      return apiOk();
    } catch (error) {
      console.error('Failed to delete tunnel backend:', error);
      return apiRouteError(error, 'Failed to delete tunnel backend');
    }
  });
}

async function syncLegacyTunnelPrimary(tunnelId: string) {
  const [primary] = await db
    .select()
    .from(tunnelBackends)
    .where(eq(tunnelBackends.tunnelId, tunnelId))
    .limit(1);
  if (!primary) return;

  await db
    .update(tunnels)
    .set({
      agentId: primary.agentId,
      target: primary.target,
      agentIp: primary.agentIp,
      updatedAt: new Date(),
    })
    .where(eq(tunnels.id, tunnelId));
}

async function broadcastConfig() {
  const wsServer = getWebSocketServer();
  if (!wsServer) return;
  await wsServer.broadcastGatewayConfig();
  await wsServer.broadcastAllAgentConfigs();
}
