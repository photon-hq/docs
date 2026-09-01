// Ordered grouping rules for the Problems tab sidebar. The first rule whose
// `exact` or `prefixes` match wins, so more specific rules come first.
//
// A slug matching no rule lands in FALLBACK_GROUP with a warning rather than
// failing the build: openapi-watch.yml redeploys on every spec change, so a new
// problem type shipped by any service must never break the deploy.

export interface GroupRule {
  group: string
  exact?: string[]
  prefixes?: string[]
}

export const FALLBACK_GROUP = 'Other'

export const GROUP_RULES: GroupRule[] = [
  {
    group: 'Generic',
    exact: [
      'forbidden',
      'not-authenticated',
      'invalid-auth-context',
      'route-not-found',
      'internal-error',
      'http-error',
      'not-found',
      'resource-not-found',
      'resource-mismatch',
      'resource-deleted',
      'already-exists',
      'limit-reached',
      'failed-precondition',
      'unsupported-entity-type',
    ],
  },
  {
    group: 'Request and validation',
    exact: [
      'validation-failed',
      'invalid-argument',
      'payload-too-large',
      'request-timeout',
      'rate-limited',
    ],
  },
  { group: 'Idempotency', prefixes: ['idempotency-'] },
  { group: 'Upstream', prefixes: ['upstream-', 'service-'] },
  {
    group: 'Account and access',
    exact: ['captcha-required', 'onboarding-completed'],
    prefixes: ['account-', 'oauth-'],
  },
  {
    group: 'Projects and billing',
    exact: ['invalid-lifecycle-state', 'entitlement-required'],
    prefixes: ['project-', 'billing-', 'payment-', 'operation-'],
  },
  {
    group: 'Compliance',
    exact: ['invalid-campaign-state', 'registration-details-unchanged'],
    prefixes: ['brand-', 'campaign-', 'otp-', 'call-registration-', 'call-registry-'],
  },
  {
    group: 'Platforms and lines',
    prefixes: ['phone-', 'imessage-', 'shared-line-', 'assignment-', 'email-domain-'],
  },
  { group: 'Voice', prefixes: ['voice-'] },
  { group: 'WhatsApp', prefixes: ['whatsapp-'] },
  // The base-bffs resource boundary: attachments, spaces, users, and messages.
  {
    group: 'Messaging resources',
    exact: ['invalid-attachment-request'],
    prefixes: ['attachment-', 'space-', 'user-', 'message-'],
  },
  { group: 'Telemetry', prefixes: ['developer-'] },
  { group: 'Webhooks', prefixes: ['webhook-'] },
]

export function groupFor(slug: string): string | null {
  for (const rule of GROUP_RULES) {
    if (rule.exact?.includes(slug))
      return rule.group
    if (rule.prefixes?.some(p => slug.startsWith(p)))
      return rule.group
  }
  return null
}
