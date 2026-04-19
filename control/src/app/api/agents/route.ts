import { NextRequest, NextResponse } from 'next/server';
import { db, agents } from '@/lib/db';
import { getWebSocketServer } from '@/lib/ws';
import { createAgentSchema } from '@/lib/utils/validation';
import { generateAgentApiKey } from '@/lib/utils';
import { withAuth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  return withAuth(request, 'read', async () => {
    try {
      const allAgents = await db.select().from(agents);
      return NextResponse.json(allAgents);
    } catch (error) {
      console.error('Failed to fetch agents:', error);
      return NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500 });
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, 'write', async () => {
    try {
      const body = await request.json();
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

      return NextResponse.json(newAgent[0], { status: 201 });
    } catch (error) {
      console.error('Failed to create agent:', error);
      if (error instanceof Error && 'issues' in error) {
        return NextResponse.json({ error: 'Validation failed', details: error }, { status: 400 });
      }
      return NextResponse.json({ error: 'Failed to create agent' }, { status: 500 });
    }
  });
}
