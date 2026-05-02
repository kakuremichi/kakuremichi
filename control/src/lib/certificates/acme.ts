import { X509Certificate } from 'crypto';
import { and, eq } from 'drizzle-orm';
import * as acme from 'acme-client';
import { db, acmeAccounts, certificates } from '@/lib/db';
import { ApiRequestError } from '@/lib/api/response';
import { deleteDns01Challenge, upsertDns01Challenge } from './dns01';
import { decryptPem, encryptPem } from './pem';

interface AcmeSettings {
  issuer: 'letsencrypt';
  directoryUrl: string;
  email: string;
  dnsPropagationSeconds: number;
  skipChallengeVerification: boolean;
}

export async function issueCertificate(certificateId: string) {
  const [certificate] = await db
    .select()
    .from(certificates)
    .where(eq(certificates.id, certificateId))
    .limit(1);

  if (!certificate) {
    throw new ApiRequestError(404, 'not_found', 'Certificate not found');
  }
  if (!certificate.dnsZoneId) {
    throw new ApiRequestError(400, 'dns_zone_required', 'Certificate needs a DNS zone for DNS-01');
  }
  if (certificate.challengeType !== 'dns-01') {
    throw new ApiRequestError(
      400,
      'unsupported_challenge_type',
      `Unsupported certificate challenge type: ${certificate.challengeType}`
    );
  }

  const settings = getAcmeSettings();
  await markCertificateIssuing(certificate.id);

  try {
    const client = await getAcmeClient(settings);
    const [privateKey, csr] = await acme.crypto.createCsr({
      commonName: certificate.domain,
      altNames: [certificate.domain],
    });

    const issuedCertificate = await client.auto({
      csr,
      email: settings.email,
      termsOfServiceAgreed: true,
      challengePriority: ['dns-01'],
      skipChallengeVerification: settings.skipChallengeVerification,
      challengeCreateFn: async (authz, challenge, keyAuthorization) => {
        if (challenge.type !== 'dns-01') {
          throw new Error(`Unsupported ACME challenge type: ${challenge.type}`);
        }
        await upsertDns01Challenge(certificate.dnsZoneId!, authz.identifier.value, keyAuthorization);
        if (settings.dnsPropagationSeconds > 0) {
          await sleep(settings.dnsPropagationSeconds * 1000);
        }
      },
      challengeRemoveFn: async (authz, challenge, keyAuthorization) => {
        if (challenge.type !== 'dns-01') return;
        await deleteDns01Challenge(certificate.dnsZoneId!, authz.identifier.value, keyAuthorization);
      },
    });

    const info = acme.crypto.readCertificateInfo(issuedCertificate);
    const fingerprintSha256 = certificateFingerprintSha256(issuedCertificate);
    const renewAfter = new Date(info.notAfter.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [updated] = await db
      .update(certificates)
      .set({
        status: 'ready',
        certificatePemEncrypted: encryptPem(issuedCertificate),
        privateKeyPemEncrypted: encryptPem(privateKey.toString('utf8')),
        notBefore: info.notBefore,
        notAfter: info.notAfter,
        renewAfter,
        fingerprintSha256,
        lastIssuedAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(certificates.id, certificate.id))
      .returning();
    if (!updated) {
      throw new Error('Certificate disappeared during issuance');
    }
    return updated;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Certificate issuance failed';
    await db
      .update(certificates)
      .set({
        status: 'error',
        lastError: message,
        updatedAt: new Date(),
      })
      .where(eq(certificates.id, certificate.id));
    throw error;
  }
}

export function decryptCertificateBundle(row: {
  certificatePemEncrypted: string | null;
  privateKeyPemEncrypted: string | null;
}) {
  if (!row.certificatePemEncrypted || !row.privateKeyPemEncrypted) return null;
  return {
    certificatePem: decryptPem(row.certificatePemEncrypted),
    privateKeyPem: decryptPem(row.privateKeyPemEncrypted),
  };
}

function getAcmeSettings(): AcmeSettings {
  const email = process.env.CONTROL_ACME_EMAIL || process.env.ACME_EMAIL;
  if (!email) {
    throw new ApiRequestError(
      400,
      'acme_email_required',
      'Set CONTROL_ACME_EMAIL or ACME_EMAIL before issuing certificates'
    );
  }

  const staging = parseBool(process.env.CONTROL_ACME_STAGING ?? process.env.ACME_STAGING, false);
  const directoryUrl =
    process.env.CONTROL_ACME_DIRECTORY_URL ||
    (staging ? acme.directory.letsencrypt.staging : acme.directory.letsencrypt.production);

  return {
    issuer: 'letsencrypt',
    directoryUrl,
    email,
    dnsPropagationSeconds: parseNumber(process.env.ACME_DNS_PROPAGATION_SECONDS, 10),
    skipChallengeVerification: parseBool(process.env.ACME_SKIP_CHALLENGE_VERIFICATION, false),
  };
}

async function getAcmeClient(settings: AcmeSettings): Promise<acme.Client> {
  const [account] = await db
    .select()
    .from(acmeAccounts)
    .where(
      and(
        eq(acmeAccounts.issuer, settings.issuer),
        eq(acmeAccounts.directoryUrl, settings.directoryUrl),
        eq(acmeAccounts.email, settings.email)
      )
    )
    .limit(1);

  if (account) {
    const client = new acme.Client({
      directoryUrl: settings.directoryUrl,
      accountKey: decryptPem(account.accountKeyEncrypted),
      accountUrl: account.accountUrl ?? undefined,
    });
    if (!account.accountUrl) {
      await client.createAccount({
        termsOfServiceAgreed: true,
        contact: [`mailto:${settings.email}`],
      });
      await db
        .update(acmeAccounts)
        .set({ accountUrl: client.getAccountUrl(), updatedAt: new Date() })
        .where(eq(acmeAccounts.id, account.id));
    }
    return client;
  }

  const accountKey = (await acme.crypto.createPrivateEcdsaKey('P-256')).toString('utf8');
  const client = new acme.Client({
    directoryUrl: settings.directoryUrl,
    accountKey,
  });
  await client.createAccount({
    termsOfServiceAgreed: true,
    contact: [`mailto:${settings.email}`],
  });

  await db.insert(acmeAccounts).values({
    issuer: settings.issuer,
    directoryUrl: settings.directoryUrl,
    email: settings.email,
    accountUrl: client.getAccountUrl(),
    accountKeyEncrypted: encryptPem(accountKey),
  });

  return client;
}

async function markCertificateIssuing(certificateId: string) {
  await db
    .update(certificates)
    .set({ status: 'issuing', lastError: null, updatedAt: new Date() })
    .where(eq(certificates.id, certificateId));
}

function certificateFingerprintSha256(certificatePem: string): string {
  const [leaf] = acme.crypto.splitPemChain(certificatePem);
  if (!leaf) return '';
  return new X509Certificate(leaf).fingerprint256.replace(/:/g, '').toLowerCase();
}

function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function parseNumber(value: string | undefined, defaultValue: number): number {
  if (value === undefined || value === '') return defaultValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
