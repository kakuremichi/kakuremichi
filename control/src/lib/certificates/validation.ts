import { z } from 'zod';
import { domainSchema } from '@/lib/utils/validation';
import {
  CERTIFICATE_CHALLENGE_TYPES,
  CERTIFICATE_ISSUERS,
  CERTIFICATE_STATUSES,
} from './types';

export const certificateDomainSchema = z
  .string()
  .min(1, 'Domain is required')
  .max(255, 'Domain too long')
  .transform((value) => value.trim().replace(/\.$/, '').toLowerCase())
  .pipe(z.union([
    domainSchema,
    z.string().regex(/^\*\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/, 'Invalid wildcard domain format'),
  ]));

export const createCertificateSchema = z.object({
  domain: certificateDomainSchema,
  dnsZoneId: z.string().uuid('Invalid DNS zone ID'),
  issuer: z.enum(CERTIFICATE_ISSUERS).optional().default('letsencrypt'),
  challengeType: z.enum(CERTIFICATE_CHALLENGE_TYPES).optional().default('dns-01'),
}).strict();

export const updateCertificateSchema = z.object({
  dnsZoneId: z.string().uuid('Invalid DNS zone ID').nullable().optional(),
  status: z.enum(CERTIFICATE_STATUSES).optional(),
}).strict();
