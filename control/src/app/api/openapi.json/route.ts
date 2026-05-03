import { apiJson } from '@/lib/api/response';

const errorSchema = {
  type: 'object',
  required: ['error', 'code'],
  properties: {
    error: { type: 'string' },
    code: { type: 'string' },
    details: {},
  },
};

const agentSchema = {
  type: 'object',
  required: ['id', 'name', 'apiKeyPrefix', 'status', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    apiKeyPrefix: { type: ['string', 'null'] },
    wireguardPublicKey: { type: ['string', 'null'] },
    virtualIp: { type: ['string', 'null'], deprecated: true },
    subnet: { type: ['string', 'null'], deprecated: true },
    status: { type: 'string', enum: ['online', 'offline', 'error'] },
    lastSeenAt: { type: ['string', 'null'], format: 'date-time' },
    metadata: { type: ['object', 'null'] },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const gatewaySchema = {
  type: 'object',
  required: ['id', 'name', 'apiKeyPrefix', 'status', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    apiKeyPrefix: { type: ['string', 'null'] },
    publicIp: { type: ['string', 'null'] },
    wireguardPublicKey: { type: ['string', 'null'] },
    region: { type: ['string', 'null'] },
    status: { type: 'string', enum: ['online', 'offline', 'error'] },
    lastSeenAt: { type: ['string', 'null'], format: 'date-time' },
    metadata: { type: ['object', 'null'] },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const tunnelSchema = {
  type: 'object',
  required: ['id', 'domain', 'enabled', 'backends', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    domain: { type: 'string' },
    agentId: { type: 'string', format: 'uuid', deprecated: true },
    target: { type: 'string', description: 'Primary origin target in host:port format.', deprecated: true },
    enabled: { type: 'boolean' },
    description: { type: ['string', 'null'] },
    subnet: { type: ['string', 'null'] },
    agentIp: { type: ['string', 'null'] },
    httpProxyEnabled: { type: 'boolean' },
    socksProxyEnabled: { type: 'boolean' },
    backends: {
      type: 'array',
      items: { $ref: '#/components/schemas/TunnelBackend' },
    },
    tls: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['disabled', 'auto', 'gateway_acme'] },
        forceHttps: { type: 'boolean' },
        certificate: { anyOf: [{ $ref: '#/components/schemas/Certificate' }, { type: 'null' }] },
      },
    },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const tunnelBackendSchema = {
  type: 'object',
  required: ['id', 'tunnelId', 'agentId', 'target', 'enabled', 'draining', 'weight', 'priority', 'agentIp'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    tunnelId: { type: 'string', format: 'uuid' },
    agentId: { type: 'string', format: 'uuid' },
    target: { type: 'string', description: 'Origin target in host:port format.' },
    enabled: { type: 'boolean' },
    draining: { type: 'boolean' },
    weight: { type: 'integer', minimum: 1, maximum: 10000, default: 100 },
    priority: { type: 'integer', minimum: 0, maximum: 1000, default: 0 },
    agentIp: { type: 'string', format: 'ipv4' },
    status: { type: 'string', enum: ['unknown', 'healthy', 'unhealthy', 'draining'] },
    lastError: { type: ['string', 'null'] },
    agent: {
      anyOf: [
        {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            status: { type: 'string' },
          },
        },
        { type: 'null' },
      ],
    },
  },
};

const tunnelBackendCreateSchema = {
  type: 'object',
  required: ['agentId', 'target'],
  additionalProperties: false,
  properties: {
    agentId: { type: 'string', format: 'uuid' },
    target: { type: 'string', description: 'host:port, for example localhost:8080' },
    enabled: { type: 'boolean', default: true },
    draining: { type: 'boolean', default: false },
    weight: { type: 'integer', minimum: 1, maximum: 10000, default: 100 },
    priority: { type: 'integer', minimum: 0, maximum: 1000, default: 0 },
  },
};

const certificateSchema = {
  type: 'object',
  required: ['id', 'domain', 'issuer', 'challengeType', 'status', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    domain: { type: 'string' },
    dnsZoneId: { type: ['string', 'null'], format: 'uuid' },
    dnsZoneName: { type: ['string', 'null'] },
    dnsProviderId: { type: ['string', 'null'], format: 'uuid' },
    dnsProviderName: { type: ['string', 'null'] },
    dnsProviderType: { type: ['string', 'null'] },
    issuer: { type: 'string', enum: ['letsencrypt'] },
    challengeType: { type: 'string', enum: ['dns-01'] },
    status: {
      type: 'string',
      enum: ['pending', 'issuing', 'ready', 'renewal_due', 'error', 'disabled'],
    },
    notBefore: { type: ['string', 'null'], format: 'date-time' },
    notAfter: { type: ['string', 'null'], format: 'date-time' },
    renewAfter: { type: ['string', 'null'], format: 'date-time' },
    fingerprintSha256: { type: ['string', 'null'] },
    lastIssuedAt: { type: ['string', 'null'], format: 'date-time' },
    lastError: { type: ['string', 'null'] },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'kakuremichi Control API',
    version: '0.1.0',
    description:
      'External API for managing kakuremichi agents, gateways, tunnels, API tokens, DNS sync, and certificate inventory.',
  },
  servers: [{ url: '/' }],
  security: [{ bearerAuth: [] }, { cookieAuth: [] }],
  components: {
    responses: {
      Unauthorized: {
        description: 'Authentication required',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      Forbidden: {
        description: 'Insufficient scope or role',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      NotFound: {
        description: 'Resource not found',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
    },
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'kmt token',
      },
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'kakuremichi_session',
      },
    },
    schemas: {
      Error: errorSchema,
      Agent: agentSchema,
      Gateway: gatewaySchema,
      ControlConnection: {
        type: 'object',
        required: ['controlBaseUrl', 'websocketUrl', 'wsPath'],
        properties: {
          controlBaseUrl: { type: 'string', format: 'uri' },
          websocketUrl: { type: 'string', format: 'uri' },
          wsPath: { type: 'string' },
        },
      },
      ControlSettingsUpdate: {
        type: 'object',
        required: ['controlBaseUrl'],
        additionalProperties: false,
        properties: {
          controlBaseUrl: { type: 'string', format: 'uri' },
        },
      },
      Tunnel: tunnelSchema,
      TunnelBackend: tunnelBackendSchema,
      Certificate: certificateSchema,
      AgentCreate: {
        type: 'object',
        required: ['name'],
        additionalProperties: false,
        properties: {
          name: { type: 'string', pattern: '^[a-zA-Z0-9_-]+$' },
          wireguardPublicKey: { type: 'string' },
        },
      },
      GatewayCreate: {
        type: 'object',
        required: ['name'],
        additionalProperties: false,
        properties: {
          name: { type: 'string', pattern: '^[a-zA-Z0-9_-]+$' },
          publicIp: { type: 'string', format: 'ipv4' },
          wireguardPublicKey: { type: 'string' },
          region: { type: 'string' },
        },
      },
      TunnelCreate: {
        type: 'object',
        required: ['domain', 'backends'],
        additionalProperties: false,
        properties: {
          domain: { type: 'string' },
          agentId: { type: 'string', format: 'uuid', deprecated: true },
          target: { type: 'string', description: 'host:port legacy primary backend.', deprecated: true },
          backends: {
            type: 'array',
            minItems: 1,
            maxItems: 64,
            items: { $ref: '#/components/schemas/TunnelBackendCreate' },
          },
          description: { type: 'string' },
          httpProxyEnabled: { type: 'boolean', default: false },
          socksProxyEnabled: { type: 'boolean', default: false },
          dnsSync: {
            type: 'object',
            additionalProperties: false,
            properties: {
              enabled: { type: 'boolean', default: true },
              zoneId: { type: 'string', format: 'uuid' },
              recordType: { type: 'string', enum: ['A'], default: 'A' },
              strategy: {
                type: 'string',
                enum: ['all_gateways', 'online_gateways'],
                default: 'all_gateways',
              },
              ttl: { type: 'integer', minimum: 60, maximum: 86400, default: 60 },
              proxied: { type: 'boolean', default: false },
            },
          },
          tls: {
            type: 'object',
            additionalProperties: false,
            properties: {
              mode: { type: 'string', enum: ['disabled', 'auto', 'gateway_acme'], default: 'disabled' },
              dnsZoneId: { type: 'string', format: 'uuid' },
              certificateId: { type: ['string', 'null'], format: 'uuid' },
              forceHttps: { type: 'boolean', default: true },
            },
          },
        },
      },
      TunnelBackendCreate: tunnelBackendCreateSchema,
      TunnelBackendUpdate: {
        ...tunnelBackendCreateSchema,
        required: [],
      },
      ApiTokenCreate: {
        type: 'object',
        required: ['name', 'scopes'],
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          scopes: {
            type: 'array',
            minItems: 1,
            items: { type: 'string', enum: ['read', 'write', 'admin'] },
          },
          expiresInDays: { type: 'integer', minimum: 1, maximum: 3650 },
        },
      },
      CertificateCreate: {
        type: 'object',
        required: ['domain', 'dnsZoneId'],
        additionalProperties: false,
        properties: {
          domain: {
            type: 'string',
            description: 'Domain or wildcard domain, for example app.example.com or *.example.com.',
          },
          dnsZoneId: {
            type: 'string',
            format: 'uuid',
            description: 'DNS zone used for ACME DNS-01 challenges.',
          },
          issuer: { type: 'string', enum: ['letsencrypt'], default: 'letsencrypt' },
          challengeType: { type: 'string', enum: ['dns-01'], default: 'dns-01' },
        },
      },
      Ok: {
        type: 'object',
        required: ['ok'],
        properties: { ok: { type: 'boolean', const: true } },
      },
    },
  },
  paths: {
    '/api/auth/me': {
      get: {
        summary: 'Get current API identity',
        responses: {
          '200': { description: 'Current authenticated identity' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/api/tokens': {
      get: {
        summary: 'List API tokens for the current user',
        responses: { '200': { description: 'Token list' } },
      },
      post: {
        summary: 'Create an API token',
        description: 'The plaintext token is returned only in this response.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiTokenCreate' } } },
        },
        responses: { '201': { description: 'Created token with one-time plaintext value' } },
      },
    },
    '/api/tokens/{id}': {
      delete: {
        summary: 'Revoke an API token',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Token revoked' } },
      },
    },
    '/api/settings/control': {
      get: {
        summary: 'Get Control public endpoint settings',
        responses: {
          '200': {
            description: 'Control endpoint values used by Agent and Gateway provisioning',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ControlConnection' } } },
          },
        },
      },
      put: {
        summary: 'Update Control public endpoint settings',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ControlSettingsUpdate' } } },
        },
        responses: {
          '200': {
            description: 'Updated Control endpoint values',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ControlConnection' } } },
          },
        },
      },
    },
    '/api/agents': {
      get: {
        summary: 'List agents',
        responses: {
          '200': {
            description: 'Agent list',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Agent' } },
              },
            },
          },
        },
      },
      post: {
        summary: 'Create an agent',
        description: 'The Agent API key and Control connection values are returned only in this creation response.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/AgentCreate' } } },
        },
        responses: { '201': { description: 'Created agent with one-time apiKey' } },
      },
    },
    '/api/agents/{id}': {
      get: {
        summary: 'Get an agent',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Agent', content: { 'application/json': { schema: { $ref: '#/components/schemas/Agent' } } } } },
      },
      patch: {
        summary: 'Update an agent management record',
        description: 'Runtime status fields are managed by WebSocket clients, not this endpoint.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: { name: { type: 'string', pattern: '^[a-zA-Z0-9_-]+$' } },
              },
            },
          },
        },
        responses: { '200': { description: 'Updated agent' } },
      },
      delete: {
        summary: 'Delete an agent',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Agent deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/Ok' } } } } },
      },
    },
    '/api/gateways': {
      get: {
        summary: 'List gateways',
        responses: {
          '200': {
            description: 'Gateway list',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Gateway' } },
              },
            },
          },
        },
      },
      post: {
        summary: 'Create a gateway',
        description: 'The Gateway API key and Control connection values are returned only in this creation response.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/GatewayCreate' } } },
        },
        responses: { '201': { description: 'Created gateway with one-time apiKey' } },
      },
    },
    '/api/gateways/{id}': {
      get: {
        summary: 'Get a gateway',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Gateway' } },
      },
      patch: {
        summary: 'Update a gateway management record',
        description: 'Runtime status fields are managed by WebSocket clients, not this endpoint.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  name: { type: 'string', pattern: '^[a-zA-Z0-9_-]+$' },
                  publicIp: { type: ['string', 'null'], format: 'ipv4' },
                  region: { type: ['string', 'null'] },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Updated gateway' } },
      },
      delete: {
        summary: 'Delete a gateway',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Gateway deleted' } },
      },
    },
    '/api/tunnels': {
      get: {
        summary: 'List tunnels',
        responses: { '200': { description: 'Tunnel list' } },
      },
      post: {
        summary: 'Create a tunnel',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/TunnelCreate' } } },
        },
        responses: { '201': { description: 'Created tunnel' } },
      },
    },
    '/api/tunnels/{id}': {
      get: {
        summary: 'Get a tunnel',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Tunnel' } },
      },
      patch: {
        summary: 'Update a tunnel',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Updated tunnel' } },
      },
      delete: {
        summary: 'Delete a tunnel',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Tunnel deleted' } },
      },
    },
    '/api/tunnels/{id}/backends': {
      get: {
        summary: 'List tunnel backends',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Backend list',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/TunnelBackend' } },
              },
            },
          },
        },
      },
      post: {
        summary: 'Add a tunnel backend',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/TunnelBackendCreate' } } },
        },
        responses: { '201': { description: 'Created backend' } },
      },
    },
    '/api/tunnels/{id}/backends/{backendId}': {
      patch: {
        summary: 'Update a tunnel backend',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'backendId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/TunnelBackendUpdate' } } },
        },
        responses: { '200': { description: 'Updated backend' } },
      },
      delete: {
        summary: 'Delete a tunnel backend',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'backendId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Backend deleted' } },
      },
    },
    '/api/dns/zones': {
      get: { summary: 'List DNS zones', responses: { '200': { description: 'DNS zone list' } } },
    },
    '/api/dns/providers': {
      get: { summary: 'List DNS providers', responses: { '200': { description: 'DNS provider list' } } },
      post: { summary: 'Create a DNS provider', responses: { '201': { description: 'DNS provider created' } } },
    },
    '/api/dns/providers/{id}': {
      patch: {
        summary: 'Update a DNS provider',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'DNS provider updated' } },
      },
      delete: {
        summary: 'Delete a DNS provider',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'DNS provider deleted' } },
      },
    },
    '/api/dns/providers/{id}/zones/import': {
      post: {
        summary: 'Import zones from a DNS provider',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Imported zones' } },
      },
    },
    '/api/dns/sync': {
      post: { summary: 'Sync all DNS settings or one tunnel', responses: { '200': { description: 'DNS sync result' } } },
    },
    '/api/certificates': {
      get: {
        summary: 'List managed certificates',
        responses: {
          '200': {
            description: 'Certificate list without private key material',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Certificate' } },
              },
            },
          },
        },
      },
      post: {
        summary: 'Create a certificate inventory record',
        description:
          'Creates the Control-side certificate record and binds it to a DNS zone for future DNS-01 issuance.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CertificateCreate' } } },
        },
        responses: { '201': { description: 'Certificate record created' } },
      },
    },
    '/api/certificates/{id}': {
      get: {
        summary: 'Get a managed certificate',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Certificate without private key material' } },
      },
      patch: {
        summary: 'Update certificate DNS zone or status',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Certificate updated' } },
      },
      delete: {
        summary: 'Delete a certificate inventory record',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Certificate deleted' } },
      },
    },
    '/api/certificates/{id}/issue': {
      post: {
        summary: 'Issue or renew a managed certificate',
        description: 'Runs ACME DNS-01 using the certificate DNS zone and stores encrypted PEM material.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Certificate issued without private key material' } },
      },
    },
  },
};

export async function GET() {
  return apiJson(openApiDocument);
}
