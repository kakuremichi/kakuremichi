import { NextRequest, NextResponse } from 'next/server';
import { importDnsZones } from '@/lib/dns/sync';
import { withAuth } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, 'admin', async () => {
    try {
      const { id } = await params;
      const zones = await importDnsZones(id);
      return NextResponse.json({ zones });
    } catch (err) {
      console.error('Failed to import DNS zones:', err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Failed to import DNS zones' },
        { status: 500 }
      );
    }
  });
}
