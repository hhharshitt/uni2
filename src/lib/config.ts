/** Comma-separated college domains allowed to sign up. "*" disables the check (local testing only). */
const RAW_DOMAINS = process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS ?? 'muj.manipal.edu,jaipur.manipal.edu';

export const ALLOWED_EMAIL_DOMAINS = RAW_DOMAINS.split(',')
  .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
  .filter(Boolean);

export const ANY_DOMAIN_ALLOWED = ALLOWED_EMAIL_DOMAINS.includes('*');

export function isAllowedEmail(email: string): boolean {
  if (ANY_DOMAIN_ALLOWED) return true;
  const domain = email.trim().toLowerCase().split('@')[1] ?? '';
  return ALLOWED_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

export const EMERGENCY_NUMBER = '112';
export const WOMEN_HELPLINE = '1091';
export const MAX_SEATS = 6;
export const MAX_RECURRING_INSTANCES = 30;
export const SEARCH_RADIUS_KM = 5;

