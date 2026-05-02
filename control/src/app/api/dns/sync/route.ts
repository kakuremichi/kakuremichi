import { NextRequest } from 'next/server';
import { z } from 'zod';
import { syncAllDnsSettings, syncTunnelDns } from '@/lib/dns/sync';
import { withAuth } from '@/lib/auth';
import { apiError, apiJson, apiRouteError } from '@/lib/api/response';

const syncSchema = z.object({
  tunnelId: z.string().uuid().optional(),
}).strict();

export async function POST(request: NextRequest) {
  return withAuth(request, 'write', async () => {
    try {
      const body = await request.json().catch(() => ({}));
      const data = syncSchema.parse(body);
      if (data.tunnelId) {
        const result = await syncTunnelDns(data.tunnelId);
        return apiJson(result);
      }
      const results = await syncAllDnsSettings();
      return apiJson({ results });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return apiRouteError(err, 'Failed to sync DNS');
      }
      console.error('Failed to sync DNS:', err);
      return apiError(
        'dns_sync_error',
        err instanceof Error ? err.message : 'Failed to sync DNS',
        502
      );
    }
  });
}
