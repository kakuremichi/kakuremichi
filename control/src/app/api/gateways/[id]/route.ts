import { NextRequest } from 'next/server';
import { db, gateways } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { withAuth } from '@/lib/auth';
import { getWebSocketServer } from '@/lib/ws';
import { syncAllDnsSettings } from '@/lib/dns/sync';
import { gatewayResource } from '@/lib/api/resources';
import { apiError, apiJson, apiOk, apiRouteError, readJsonBody } from '@/lib/api/response';
import { updateGatewaySchema } from '@/lib/utils/validation';

async function broadcastGatewayChange() {
  try {
    const wsServer = getWebSocketServer();
    if (!wsServer) return;
    await wsServer.broadcastGatewayConfig();
    await wsServer.broadcastAllAgentConfigs();
  } catch (err) {
    console.error('Failed to broadcast gateway change:', err);
  }
}

async function reconcileDns() {
  try {
    await syncAllDnsSettings();
  } catch (err) {
    console.error('Failed to sync DNS after gateway change:', err);
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, 'read', async () => {
    try {
      const { id } = await params;
      const gateway = await db.select().from(gateways).where(eq(gateways.id, id)).limit(1);
      const foundGateway = gateway[0];
      if (!foundGateway) {
        return apiError('not_found', 'Gateway not found', 404);
      }
      return apiJson(gatewayResource(foundGateway));
    } catch (error) {
      console.error('Failed to fetch gateway:', error);
      return apiRouteError(error, 'Failed to fetch gateway');
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
      const deleted = await db.delete(gateways).where(eq(gateways.id, id)).returning();
      if (deleted.length === 0) {
        return apiError('not_found', 'Gateway not found', 404);
      }
      await reconcileDns();
      await broadcastGatewayChange();
      return apiOk();
    } catch (error) {
      console.error('Failed to delete gateway:', error);
      return apiRouteError(error, 'Failed to delete gateway');
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
      const validatedData = updateGatewaySchema.parse(body);

      const updated = await db
        .update(gateways)
        .set({
          ...validatedData,
          updatedAt: new Date(),
        })
        .where(eq(gateways.id, id))
        .returning();

      const updatedGateway = updated[0];
      if (!updatedGateway) {
        return apiError('not_found', 'Gateway not found', 404);
      }
      await reconcileDns();
      await broadcastGatewayChange();
      return apiJson(gatewayResource(updatedGateway));
    } catch (error) {
      console.error('Failed to update gateway:', error);
      return apiRouteError(error, 'Failed to update gateway');
    }
  });
}
