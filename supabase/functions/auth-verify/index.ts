import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

serve(async (req) => {
  const url = new URL(req.url)
  const tokenHash = url.searchParams.get('token_hash') || ''
  const type = url.searchParams.get('type') || 'signup'

  // Don't verify the token here — Gmail/Outlook pre-fetch links and consume tokens.
  // Instead, pass the token to the app and let it verify.
  const params = new URLSearchParams({ token_hash: tokenHash, type })

  // Use production scheme — tackbird:// (not Expo Go exp+tackbird-mobile://)
  const expoUrl = `tackbird://auth/callback?${params.toString()}`

  return new Response(null, {
    status: 302,
    headers: { 'Location': expoUrl },
  })
})
