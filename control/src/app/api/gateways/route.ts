import { NextRequest, NextResponse } from 'next/server';
import { db, gateways } from '@/lib/db';
import { createGatewaySchema } from '@/lib/utils/validation';
import { generateGatewayApiKey } from '@/lib/utils';

/**
 * GET /api/gateways - List all gateways
 */
export async function GET() {
  try {
    const allGateways = await db.select().from(gateways);
    return NextResponse.json(allGateways);
  } catch (error) {
    console.error('Failed to fetch gateways:', error);
    return NextResponse.json(
      { error: 'Failed to fetch gateways' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/gateways - Create a new gateway
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    const validatedData = createGatewaySchema.parse(body);

    // Generate API key
    const apiKey = generateGatewayApiKey();

    // Insert gateway
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

    return NextResponse.json(newGateway[0], { status: 201 });
  } catch (error) {
    console.error('Failed to create gateway:', error);

    if (error instanceof Error && 'issues' in error) {
      return NextResponse.json(
        { error: 'Validation failed', details: error },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create gateway' },
      { status: 500 }
    );
  }
}
