import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { syncAllDnsSettings, syncTunnelDns } from '@/lib/dns/sync';
import { withAuth } from '@/lib/auth';

const syncSchema = z.object({
  tunnelId: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  return withAuth(request, 'write', async () => {
    try {
      const body = await request.json().catch(() => ({}));
      const data = syncSchema.parse(body);
      if (data.tunnelId) {
        const result = await syncTunnelDns(data.tunnelId);
        return NextResponse.json(result);
      }
      const results = await syncAllDnsSettings();
      return NextResponse.json({ results });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: 'Invalid request', details: err.issues }, { status: 400 });
      }
      console.error('Failed to sync DNS:', err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Failed to sync DNS' },
        { status: 500 }
      );
    }
  });
}
