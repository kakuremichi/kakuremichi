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
