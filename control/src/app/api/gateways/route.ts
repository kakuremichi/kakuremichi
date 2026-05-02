import { NextRequest, NextResponse } from 'next/server';
import { db, gateways } from '@/lib/db';
import { createGatewaySchema } from '@/lib/utils/validation';
import { generateGatewayApiKey, allocateTunnelIpsForGateway } from '@/lib/utils';
import { getWebSocketServer } from '@/lib/ws';
import { syncAllDnsSettings } from '@/lib/dns/sync';
import { withAuth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  return withAuth(request, 'read', async () => {
    try {
      const allGateways = await db.select().from(gateways);
      return NextResponse.json(allGateways);
    } catch (error) {
      console.error('Failed to fetch gateways:', error);
      return NextResponse.json({ error: 'Failed to fetch gateways' }, { status: 500 });
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, 'write', async () => {
    try {
      const body = await request.json();
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

      return NextResponse.json(createdGateway, { status: 201 });
    } catch (error) {
      console.error('Failed to create gateway:', error);
      if (error instanceof Error && 'issues' in error) {
        return NextResponse.json({ error: 'Validation failed', details: error }, { status: 400 });
      }
      return NextResponse.json({ error: 'Failed to create gateway' }, { status: 500 });
    }
  });
}
