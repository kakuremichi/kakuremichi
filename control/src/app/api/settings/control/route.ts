import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiJson, apiRouteError, readJsonBody } from '@/lib/api/response';
import { withAuth } from '@/lib/auth';
import {
  getControlConnectionConfig,
  normalizeControlBaseUrl,
  requestOrigin,
  setControlBaseUrl,
} from '@/lib/settings/control-url';

const controlBaseUrlSchema = z.string().min(1).max(2048).transform((value, ctx) => {
  try {
    return normalizeControlBaseUrl(value);
  } catch (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: error instanceof Error ? error.message : 'Invalid Control URL',
    });
    return z.NEVER;
  }
});

const controlSettingsSchema = z.object({
  controlBaseUrl: controlBaseUrlSchema,
}).strict();

export async function GET(request: NextRequest) {
  return withAuth(request, 'read', async () => {
    try {
      return apiJson(await getControlConnectionConfig(requestOrigin(request)));
    } catch (error) {
      console.error('Failed to read control settings:', error);
      return apiRouteError(error, 'Failed to read control settings');
    }
  });
}

export async function PUT(request: NextRequest) {
  return updateControlSettings(request);
}

export async function PATCH(request: NextRequest) {
  return updateControlSettings(request);
}

async function updateControlSettings(request: NextRequest) {
  return withAuth(request, 'admin', async () => {
    try {
      const body = await readJsonBody(request);
      const { controlBaseUrl } = controlSettingsSchema.parse(body);
      await setControlBaseUrl(controlBaseUrl);
      return apiJson(await getControlConnectionConfig(requestOrigin(request)));
    } catch (error) {
      console.error('Failed to update control settings:', error);
      return apiRouteError(error, 'Failed to update control settings');
    }
  });
}
