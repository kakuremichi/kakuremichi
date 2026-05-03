import { NextRequest } from 'next/server';
import { db, agents } from '@/lib/db';
import { getWebSocketServer } from '@/lib/ws';
import { createAgentSchema } from '@/lib/utils/validation';
import { generateAgentApiKey } from '@/lib/utils';
import { withAuth } from '@/lib/auth';
import { agentResource } from '@/lib/api/resources';
import { apiCreated, apiJson, apiRouteError, readJsonBody } from '@/lib/api/response';
import { getControlConnectionConfig, requestOrigin } from '@/lib/settings/control-url';

export async function GET(request: NextRequest) {
  return withAuth(request, 'read', async () => {
    try {
      const allAgents = await db.select().from(agents);
      return apiJson(allAgents.map((agent) => agentResource(agent)));
    } catch (error) {
      console.error('Failed to fetch agents:', error);
      return apiRouteError(error, 'Failed to fetch agents');
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, 'write', async () => {
    try {
      const body = await readJsonBody(request);
      const validatedData = createAgentSchema.parse(body);

      const apiKey = generateAgentApiKey();
      const newAgent = await db
        .insert(agents)
        .values({
          name: validatedData.name,
          apiKey,
          wireguardPublicKey: validatedData.wireguardPublicKey ?? null,
          status: 'offline',
        })
        .returning();

      try {
        const wsServer = getWebSocketServer();
        if (wsServer) {
          await wsServer.broadcastGatewayConfig();
        } else {
          console.warn('WebSocket server not initialized; cannot broadcast agent creation config.');
        }
      } catch (err) {
        console.error('Failed to broadcast agent creation config:', err);
      }

      const createdAgent = newAgent[0];
      if (!createdAgent) {
        throw new Error('Agent insert returned no row');
      }
      return apiCreated({
        ...agentResource(createdAgent, { includeApiKey: true }),
        connection: await getControlConnectionConfig(requestOrigin(request)),
      });
    } catch (error) {
      console.error('Failed to create agent:', error);
      return apiRouteError(error, 'Failed to create agent');
    }
  });
}
