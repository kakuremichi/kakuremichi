import { NextRequest } from 'next/server';
import { getWebSocketServer } from '@/lib/ws';
import { withAuth } from '@/lib/auth';
import { apiJson, apiRouteError } from '@/lib/api/response';
import { issueCertificate } from '@/lib/certificates/acme';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, 'admin', async () => {
    try {
      const { id } = await params;
      const certificate = await issueCertificate(id);
      const { certificatePemEncrypted, privateKeyPemEncrypted, ...safeCertificate } = certificate;

      try {
        const wsServer = getWebSocketServer();
        if (wsServer) {
          await wsServer.broadcastGatewayConfig();
        }
      } catch (err) {
        console.error('Failed to broadcast certificate config:', err);
      }

      return apiJson(safeCertificate);
    } catch (err) {
      console.error('Failed to issue certificate:', err);
      return apiRouteError(err, 'Failed to issue certificate');
    }
  });
}
