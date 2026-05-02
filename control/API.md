# kakuremichi Control API

The Control API is intended for UI clients, automation, and external tools.

## Authentication

Use a personal API token with the `Authorization` header:

```bash
curl -H "Authorization: Bearer kmt_xxx" http://localhost:3000/api/agents
```

Tokens are created from the UI under `Settings > API Tokens` or via `POST /api/tokens`.

Scopes:

- `read`: list and read resources.
- `write`: create, update, delete, and run sync operations.
- `admin`: manage DNS providers and other admin-only operations.

## Contract

Successful delete/revoke operations return:

```json
{ "ok": true }
```

Errors use a stable shape:

```json
{
  "error": "Validation failed",
  "code": "validation_failed",
  "details": []
}
```

Agent and Gateway API keys are secret values. List/detail endpoints return only
`apiKeyPrefix`; the full `apiKey` is returned only from the create response.

## OpenAPI

The machine-readable API description is available at:

```text
GET /api/openapi.json
```

## Operational Notes

Set a stable `ENCRYPTION_KEY` before creating DNS providers. DNS provider
credentials are encrypted at rest; changing or losing the key makes existing
provider credentials unreadable. `SESSION_SECRET` is accepted as a fallback for
development, but production and shared debug environments should use a dedicated
`ENCRYPTION_KEY`.

Certificate records never return encrypted PEM or private key material from the
API. `POST /api/certificates` stores the domain and DNS zone that will be used
for ACME DNS-01 issuance. This keeps certificate issuance independent from a
specific DNS provider; switching providers means importing the new zone and
updating the certificate's `dnsZoneId` before the next renewal.

## Examples

Create an Agent:

```bash
curl -X POST http://localhost:3000/api/agents \
  -H "Authorization: Bearer kmt_xxx" \
  -H "Content-Type: application/json" \
  -d '{"name":"agent-1"}'
```

Create a Gateway:

```bash
curl -X POST http://localhost:3000/api/gateways \
  -H "Authorization: Bearer kmt_xxx" \
  -H "Content-Type: application/json" \
  -d '{"name":"gateway-1","publicIp":"203.0.113.10"}'
```

Create a Tunnel:

```bash
curl -X POST http://localhost:3000/api/tunnels \
  -H "Authorization: Bearer kmt_xxx" \
  -H "Content-Type: application/json" \
  -d '{"domain":"app.example.com","agentId":"AGENT_UUID","target":"localhost:8080"}'
```

Create a certificate inventory record:

```bash
curl -X POST http://localhost:3000/api/certificates \
  -H "Authorization: Bearer kmt_xxx" \
  -H "Content-Type: application/json" \
  -d '{"domain":"app.example.com","dnsZoneId":"DNS_ZONE_UUID"}'
```
