import { NextRequest, NextResponse } from 'next/server';
import { db, tunnels } from '@/lib/db';
import { updateTunnelSchema } from '@/lib/utils/validation';
import { eq } from 'drizzle-orm';

/**
 * GET /api/tunnels/:id - Get tunnel by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const tunnel = await db
      .select()
      .from(tunnels)
      .where(eq(tunnels.id, params.id))
      .limit(1);

    if (tunnel.length === 0) {
      return NextResponse.json({ error: 'Tunnel not found' }, { status: 404 });
    }

    return NextResponse.json(tunnel[0]);
  } catch (error) {
    console.error('Failed to fetch tunnel:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tunnel' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/tunnels/:id - Update tunnel
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();

    // Validate request body
    const validatedData = updateTunnelSchema.parse(body);

    // Update tunnel
    const updated = await db
      .update(tunnels)
      .set({
        ...validatedData,
        updatedAt: new Date(),
      })
      .where(eq(tunnels.id, params.id))
      .returning();

    if (updated.length === 0) {
      return NextResponse.json({ error: 'Tunnel not found' }, { status: 404 });
    }

    return NextResponse.json(updated[0]);
  } catch (error) {
    console.error('Failed to update tunnel:', error);

    if (error instanceof Error && 'issues' in error) {
      return NextResponse.json(
        { error: 'Validation failed', details: error },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update tunnel' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/tunnels/:id - Delete tunnel
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const deleted = await db
      .delete(tunnels)
      .where(eq(tunnels.id, params.id))
      .returning();

    if (deleted.length === 0) {
      return NextResponse.json({ error: 'Tunnel not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete tunnel:', error);
    return NextResponse.json(
      { error: 'Failed to delete tunnel' },
      { status: 500 }
    );
  }
}
