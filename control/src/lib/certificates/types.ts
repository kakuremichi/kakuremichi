export const CERTIFICATE_ISSUERS = ['letsencrypt'] as const;
export type CertificateIssuer = (typeof CERTIFICATE_ISSUERS)[number];

export const CERTIFICATE_CHALLENGE_TYPES = ['dns-01'] as const;
export type CertificateChallengeType = (typeof CERTIFICATE_CHALLENGE_TYPES)[number];

export const CERTIFICATE_STATUSES = [
  'pending',
  'issuing',
  'ready',
  'renewal_due',
  'error',
  'disabled',
] as const;
export type CertificateStatus = (typeof CERTIFICATE_STATUSES)[number];

export const TUNNEL_TLS_MODES = ['disabled', 'auto', 'gateway_acme'] as const;
export type TunnelTlsMode = (typeof TUNNEL_TLS_MODES)[number];
