/**
 * Maps Supabase and Stripe error codes/messages to user-friendly translated strings.
 * Always call with the `t` function from useI18n() so the message is in the user's locale.
 */
export function mapErrorToFinnish(error: any, t: (key: string) => string): string {
  if (!error) return t('errors.unknown')

  const message: string =
    typeof error === 'string'
      ? error
      : error?.message ?? error?.error_description ?? ''

  const code: string = error?.code ?? error?.status ?? ''

  // --- Network / connectivity ---
  if (
    message.includes('Network request failed') ||
    message.includes('Failed to fetch') ||
    message.includes('network error') ||
    message.toLowerCase().includes('no internet') ||
    code === 'NETWORK_ERROR'
  ) {
    return t('errors.network')
  }

  if (
    message.includes('timeout') ||
    message.includes('Timeout') ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNABORTED'
  ) {
    return t('errors.timeout')
  }

  // --- Server errors (5xx) ---
  const statusNum = typeof error?.status === 'number' ? error.status : parseInt(code, 10)
  if (
    (statusNum >= 500 && statusNum < 600) ||
    message.includes('Internal Server Error') ||
    message.includes('Bad Gateway') ||
    message.includes('Service Unavailable') ||
    message.includes('Gateway Timeout') ||
    code === '500' ||
    code === '502' ||
    code === '503' ||
    code === '504'
  ) {
    return t('errors.serverError')
  }

  // --- Auth errors ---
  if (
    message.includes('Invalid login credentials') ||
    message.includes('invalid_grant') ||
    code === 'invalid_credentials'
  ) {
    return t('auth.invalidCredentials')
  }

  if (
    message.includes('Email not confirmed') ||
    code === 'email_not_confirmed'
  ) {
    return t('auth.emailNotConfirmed')
  }

  if (
    message.includes('User already registered') ||
    code === 'user_already_exists'
  ) {
    return t('auth.userAlreadyRegistered')
  }

  if (
    message.includes('Password should be at least') ||
    message.includes('Signup requires a valid password')
  ) {
    return t('auth.passwordTooShort')
  }

  if (
    message.includes('session_not_found') ||
    message.includes('JWT expired') ||
    message.includes('token is expired') ||
    code === 'session_not_found'
  ) {
    return t('errors.unauthorized')
  }

  // --- Permission / authorization ---
  if (
    message.includes('permission denied') ||
    message.includes('Forbidden') ||
    message.includes('not authorized') ||
    code === '42501' ||
    code === '403'
  ) {
    return t('errors.permissionDenied')
  }

  // --- Not found ---
  if (
    message.includes('not found') ||
    message.includes('PGRST116') ||
    code === '404' ||
    code === 'PGRST116'
  ) {
    return t('errors.notFound')
  }

  // --- Rate limiting ---
  if (
    message.includes('rate limit') ||
    message.includes('Rate limit') ||
    message.includes('too many requests') ||
    message.includes('Too many requests') ||
    code === '429' ||
    code === 'over_request_rate_limit' ||
    code === 'over_email_send_rate_limit'
  ) {
    return t('errors.rateLimited')
  }

  // --- Stripe card errors ---
  if (
    code === 'card_declined' ||
    message.includes('card_declined') ||
    message.includes('Your card was declined')
  ) {
    return t('errors.cardDeclined')
  }

  if (
    code === 'insufficient_funds' ||
    message.includes('insufficient_funds')
  ) {
    return t('errors.insufficientFunds')
  }

  if (
    code === 'expired_card' ||
    message.includes('expired_card') ||
    message.includes('Your card has expired')
  ) {
    return t('errors.expiredCard')
  }

  // --- Generic Stripe decline fallback ---
  if (
    message.includes('stripe') ||
    message.includes('Stripe') ||
    message.includes('payment') ||
    code?.startsWith('stripe_')
  ) {
    return t('errors.cardDeclined')
  }

  // --- Unknown ---
  return t('errors.unknown')
}
