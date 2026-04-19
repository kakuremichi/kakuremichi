import { NextRequest, NextResponse } from 'next/server';
import { db, gateways } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { withAuth } from '@/lib/auth';
import { getWebSocketServer } from '@/lib/ws';

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, 'read', async () => {
    try {
      const { id } = await params;
      const gateway = await db.select().from(gateways).where(eq(gateways.id, id)).limit(1);
      if (gateway.length === 0) {
        return NextResponse.json({ error: 'Gateway not found' }, { status: 404 });
      }
      return NextResponse.json(gateway[0]);
    } catch (error) {
      console.error('Failed to fetch gateway:', error);
      return NextResponse.json({ error: 'Failed to fetch gateway' }, { status: 500 });
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
        return NextResponse.json({ error: 'Gateway not found' }, { status: 404 });
      }
      await broadcastGatewayChange();
      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Failed to delete gateway:', error);
      return NextResponse.json({ error: 'Failed to delete gateway' }, { status: 500 });
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
      const body = await request.json();
      const { status, lastSeenAt, publicIp } = body;

      const updated = await db
        .update(gateways)
        .set({
          ...(status && { status }),
          ...(lastSeenAt && { lastSeenAt: new Date(lastSeenAt) }),
          ...(publicIp !== undefined && { publicIp }),
          updatedAt: new Date(),
        })
        .where(eq(gateways.id, id))
        .returning();

      if (updated.length === 0) {
        return NextResponse.json({ error: 'Gateway not found' }, { status: 404 });
      }
      await broadcastGatewayChange();
      return NextResponse.json(updated[0]);
    } catch (error) {
      console.error('Failed to update gateway:', error);
      return NextResponse.json({ error: 'Failed to update gateway' }, { status: 500 });
    }
  });
}
