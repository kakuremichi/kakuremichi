import { eq } from 'drizzle-orm';
import { db, appSettings } from '@/lib/db';

const CONTROL_BASE_URL_KEY = 'control_base_url';

export interface ControlConnectionConfig {
  controlBaseUrl: string;
  websocketUrl: string;
  wsPath: string;
}

export function normalizeControlBaseUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('Control URL is required');

  const candidate = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  const url = new URL(candidate);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Control URL must use http or https');
  }

  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  if (url.pathname === '/') url.pathname = '';
  url.pathname = url.pathname.replace(/\/+$/, '');

  return url.toString().replace(/\/$/, '');
}

export function controlWebSocketUrl(controlBaseUrl: string, wsPath = process.env.WS_PATH || '/ws'): string {
  const url = new URL(controlBaseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = wsPath.startsWith('/') ? wsPath : `/${wsPath}`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

export async function getStoredControlBaseUrl(): Promise<string | null> {
  const rows = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, CONTROL_BASE_URL_KEY))
    .limit(1);
  return rows[0]?.value ?? null;
}

export async function setControlBaseUrl(input: string): Promise<string> {
  const value = normalizeControlBaseUrl(input);
  await db
    .insert(appSettings)
    .values({
      key: CONTROL_BASE_URL_KEY,
      value,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: {
        value,
        updatedAt: new Date(),
      },
    });
  return value;
}

export async function getControlConnectionConfig(fallbackOrigin?: string | null): Promise<ControlConnectionConfig> {
  const stored = await getStoredControlBaseUrl();
  const configured = stored
    || process.env.CONTROL_PUBLIC_URL
    || fallbackOrigin
    || process.env.PUBLIC_URL
    || process.env.NEXT_PUBLIC_API_URL
    || 'http://localhost:3000';
  const controlBaseUrl = normalizeControlBaseUrl(configured);
  const wsPath = process.env.WS_PATH || '/ws';

  return {
    controlBaseUrl,
    websocketUrl: controlWebSocketUrl(controlBaseUrl, wsPath),
    wsPath,
  };
}

export function requestOrigin(request: Request): string {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = forwardedHost || request.headers.get('host');
  const forwardedProto = request.headers.get('x-forwarded-proto');

  if (host) {
    const proto = forwardedProto || new URL(request.url).protocol.replace(':', '');
    return `${proto}://${host}`;
  }

  return new URL(request.url).origin;
}
