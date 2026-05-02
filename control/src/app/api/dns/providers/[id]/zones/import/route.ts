import { NextRequest } from 'next/server';
import { importDnsZones } from '@/lib/dns/sync';
import { withAuth } from '@/lib/auth';
import { apiError, apiJson } from '@/lib/api/response';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, 'admin', async () => {
    try {
      const { id } = await params;
      const zones = await importDnsZones(id);
      return apiJson({ zones });
    } catch (err) {
      console.error('Failed to import DNS zones:', err);
      return apiError(
        'dns_provider_error',
        err instanceof Error ? err.message : 'Failed to import DNS zones',
        502
      );
    }
  });
}
