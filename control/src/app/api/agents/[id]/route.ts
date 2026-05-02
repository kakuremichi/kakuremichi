import { NextRequest } from 'next/server';
import { db, agents } from '@/lib/db';
import { getWebSocketServer } from '@/lib/ws';
import { eq } from 'drizzle-orm';
import { withAuth } from '@/lib/auth';
import { agentResource } from '@/lib/api/resources';
import { apiError, apiJson, apiOk, apiRouteError, readJsonBody } from '@/lib/api/response';
import { updateAgentSchema } from '@/lib/utils/validation';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, 'read', async () => {
    try {
      const { id } = await params;
      const agent = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
      const foundAgent = agent[0];
      if (!foundAgent) {
        return apiError('not_found', 'Agent not found', 404);
      }
      return apiJson(agentResource(foundAgent));
    } catch (error) {
      console.error('Failed to fetch agent:', error);
      return apiRouteError(error, 'Failed to fetch agent');
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, 'write', async () => {
    try {
      const { id } = await params;
      const deleted = await db.delete(agents).where(eq(agents.id, id)).returning();
      if (deleted.length === 0) {
        return apiError('not_found', 'Agent not found', 404);
      }

      try {
        const wsServer = getWebSocketServer();
        if (wsServer) {
          await wsServer.broadcastGatewayConfig();
        }
      } catch (err) {
        console.error('Failed to broadcast agent delete config:', err);
      }

      return apiOk();
    } catch (error) {
      console.error('Failed to delete agent:', error);
      return apiRouteError(error, 'Failed to delete agent');
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
      const validatedData = updateAgentSchema.parse(body);

      const updated = await db
        .update(agents)
        .set({
          ...validatedData,
          updatedAt: new Date(),
        })
        .where(eq(agents.id, id))
        .returning();

      const updatedAgent = updated[0];
      if (!updatedAgent) {
        return apiError('not_found', 'Agent not found', 404);
      }

      try {
        const wsServer = getWebSocketServer();
        if (wsServer) {
          await wsServer.broadcastGatewayConfig();
        }
      } catch (err) {
        console.error('Failed to broadcast agent update config:', err);
      }

      return apiJson(agentResource(updatedAgent));
    } catch (error) {
      console.error('Failed to update agent:', error);
      return apiRouteError(error, 'Failed to update agent');
    }
  });
}
