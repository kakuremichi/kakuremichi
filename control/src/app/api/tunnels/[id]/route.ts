import { NextRequest } from 'next/server';
import { db, tunnels } from '@/lib/db';
import { getWebSocketServer } from '@/lib/ws';
import { deleteTunnelDnsRecords, syncTunnelDns } from '@/lib/dns/sync';
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
      return apiJson(foundTunnel);
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

      const updated = await db
        .update(tunnels)
        .set({ ...validatedData, updatedAt: new Date() })
        .where(eq(tunnels.id, id))
        .returning();

      const updatedTunnel = updated[0];
      if (!updatedTunnel) {
        return apiError('not_found', 'Tunnel not found', 404);
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
          if (updatedTunnel.agentId) {
            await wsServer.broadcastAgentConfig(updatedTunnel.agentId);
          }
        }
      } catch (err) {
        console.error('Failed to broadcast tunnel update config:', err);
      }

      return apiJson(updatedTunnel);
    } catch (error) {
      console.error('Failed to update tunnel:', error);
      return apiRouteError(error, 'Failed to update tunnel');
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
          if (deletedTunnel.agentId) {
            await wsServer.broadcastAgentConfig(deletedTunnel.agentId);
          }
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
