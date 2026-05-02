import { NextRequest } from 'next/server';
import { db, gateways } from '@/lib/db';
import { createGatewaySchema } from '@/lib/utils/validation';
import { generateGatewayApiKey, allocateTunnelIpsForGateway } from '@/lib/utils';
import { getWebSocketServer } from '@/lib/ws';
import { syncAllDnsSettings } from '@/lib/dns/sync';
import { withAuth } from '@/lib/auth';
import { gatewayResource } from '@/lib/api/resources';
import { apiCreated, apiJson, apiRouteError, readJsonBody } from '@/lib/api/response';

export async function GET(request: NextRequest) {
  return withAuth(request, 'read', async () => {
    try {
      const allGateways = await db.select().from(gateways);
      return apiJson(allGateways.map((gateway) => gatewayResource(gateway)));
    } catch (error) {
      console.error('Failed to fetch gateways:', error);
      return apiRouteError(error, 'Failed to fetch gateways');
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, 'write', async () => {
    try {
      const body = await readJsonBody(request);
      const validatedData = createGatewaySchema.parse(body);

      const apiKey = generateGatewayApiKey();
      const newGateway = await db
        .insert(gateways)
        .values({
          name: validatedData.name,
          apiKey,
          publicIp: validatedData.publicIp ?? null,
          wireguardPublicKey: validatedData.wireguardPublicKey ?? null,
          region: validatedData.region ?? null,
          status: 'offline',
        })
        .returning();

      const createdGateway = newGateway[0];
      if (createdGateway) {
        await allocateTunnelIpsForGateway(createdGateway.id);
        try {
          await syncAllDnsSettings();
        } catch (err) {
          console.error('Failed to sync DNS after gateway creation:', err);
        }
      }

      try {
        const wsServer = getWebSocketServer();
        if (wsServer) {
          await wsServer.broadcastAllAgentConfigs();
        }
      } catch (err) {
        console.error('Failed to broadcast gateway creation config:', err);
      }

      if (!createdGateway) {
        throw new Error('Gateway insert returned no row');
      }
      return apiCreated(gatewayResource(createdGateway, { includeApiKey: true }));
    } catch (error) {
      console.error('Failed to create gateway:', error);
      return apiRouteError(error, 'Failed to create gateway');
    }
  });
}
