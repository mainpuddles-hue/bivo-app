import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

// Allowed verification types — whitelist to prevent parameter injection
const ALLOWED_TYPES = new Set(['signup', 'recovery', 'invite', 'magiclink', 'email_change'])

// token_hash should be alphanumeric (base64url-safe characters only)
const TOKEN_HASH_RE = /^[a-zA-Z0-9_-]{10,128}$/

serve(async (req) => {
  const url = new URL(req.url)
  const tokenHash = url.searchParams.get('token_hash') || ''
  const type = url.searchParams.get('type') || 'signup'

  // Validate type to prevent injection into deep link
  if (!ALLOWED_TYPES.has(type)) {
    return new Response('Invalid type parameter', { status: 400 })
  }

  // Validate token_hash format — reject anything that could inject URL params
  if (!tokenHash || !TOKEN_HASH_RE.test(tokenHash)) {
    return new Response('Invalid or missing token_hash', { status: 400 })
  }

  // Don't verify the token here — Gmail/Outlook pre-fetch links and consume tokens.
  // Instead, pass the token to the app and let it verify.
  const params = new URLSearchParams({ token_hash: tokenHash, type })

  // Use production scheme — bivo:// (not Expo Go exp+bivo-app://)
  const expoUrl = `bivo://auth/callback?${params.toString()}`

  return new Response(null, {
    status: 302,
    headers: { 'Location': expoUrl },
  })
})
