# DNS Sync Integration Plan

## Goal

Control owns the desired DNS state for tunnel hostnames and keeps DNS provider
records pointed at Gateway public IPs. This keeps DNS management in the control
plane while preserving the data plane separation: external traffic still goes
directly to Gateway nodes.

## MVP Scope

- Provider model with a registry-style interface.
- Cloudflare DNS provider.
- Encrypted provider credential storage.
- Zone import from Cloudflare.
- Per-tunnel DNS sync setting.
- A record sync to Gateway `publicIp` values.
- Manual sync from the Control UI/API.
- Best-effort reconcile when Gateways are created, deleted, or their public IP
  changes.

## Out Of Scope For MVP

- Dynamic third-party plugin loading.
- DNS-01 certificate automation.
- Wildcard certificate issuance.
- Route53 / PowerDNS / ConoHa providers.
- Health-check based DNS failover.
- Automatic DNS record creation for Docker/Kubernetes discovery.

## Data Model

`dns_providers`
- Provider account connection, currently `cloudflare`.
- Stores encrypted provider configuration.

`dns_zones`
- Imported provider zones.
- Keeps provider zone IDs separate from local IDs.

`dns_sync_settings`
- One optional DNS sync configuration per tunnel.
- Controls record type, strategy, TTL, proxied flag, and last sync state.

`dns_managed_records`
- Local ownership table for remote DNS records created or adopted by Control.
- Only records in this table should be updated or deleted by Control.

## Sync Strategy

1. Resolve the tunnel's DNS sync setting.
2. Validate that the tunnel domain belongs to the selected zone.
3. Collect Gateway targets:
   - `all_gateways`: all Gateways with valid `publicIp`.
   - `online_gateways`: only online Gateways with valid `publicIp`.
4. Build desired A records.
5. List remote records with matching name and type.
6. Update records already owned by Control.
7. Adopt matching remote records when safe.
8. Create missing records.
9. Delete stale records only when Control owns them.

## Cloudflare Defaults

- Records default to DNS-only (`proxied = false`).
- Cloudflare proxied mode is exposed as an explicit advanced option because it
  routes traffic through Cloudflare's data plane.
- Required token permissions:
  - `Zone:Read`
  - `DNS:Edit`

## Future Phases

1. DNS-01 ACME support using the same provider credentials.
2. Wildcard certificate support.
3. Provider interface expansion for Route53 and other DNS providers.
4. Periodic background reconcile worker.
5. Gateway health-aware DNS target selection.
6. Docker/Kubernetes auto-discovery integration that can create tunnels and DNS
   sync settings together.
