// Edge Function: auth-verify
// Handles email verification links (GET) by calling GoTrue verify (POST)
// then shows an HTML page that opens the mobile app

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  const url = new URL(req.url)
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type') || 'signup'

  if (!tokenHash) {
    return new Response('<h1>Invalid link</h1>', {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    })
  }

  try {
    const verifyRes = await fetch(`${supabaseUrl}/auth/v1/verify`, {
      method: 'POST',
      headers: {
        'apikey': supabaseServiceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token_hash: tokenHash, type }),
    })

    if (!verifyRes.ok) {
      const err = await verifyRes.json().catch(() => ({}))
      return new Response(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TackBird</title>
<style>body{font-family:-apple-system,sans-serif;text-align:center;padding:60px 20px;background:#F5F4F0;color:#1A1A2E;}
h1{color:#D94F4F;}a{display:inline-block;margin-top:20px;padding:14px 32px;background:#2D6B5E;color:#fff;border-radius:12px;text-decoration:none;font-weight:600;}</style>
</head><body>
<h1>Linkki on vanhentunut</h1>
<p>${err.msg || 'Pyydä uusi linkki sovelluksesta.'}</p>
<a href="tackbird://auth/login">Avaa TackBird</a>
</body></html>`, { status: 400, headers: { 'Content-Type': 'text/html' } })
    }

    const data = await verifyRes.json()
    const fragment = `access_token=${data.access_token}&refresh_token=${data.refresh_token}&token_type=${data.token_type}&type=${type}`
    const tackbirdUrl = `tackbird://auth/callback#${fragment}`
    const expoUrl = `exp+tackbird-mobile://auth/callback#${fragment}`

    // Return HTML page that tries both schemes and shows a button as fallback
    return new Response(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TackBird — Vahvistettu!</title>
<style>body{font-family:-apple-system,sans-serif;text-align:center;padding:60px 20px;background:#F5F4F0;color:#1A1A2E;}
.ok{color:#2D6B5E;font-size:48px;}
a.btn{display:inline-block;margin-top:20px;padding:14px 32px;background:#2D6B5E;color:#fff;border-radius:12px;text-decoration:none;font-weight:600;font-size:16px;}
p{color:#666;margin-top:12px;}</style>
</head><body>
<div class="ok">✓</div>
<h1>${type === 'recovery' ? 'Salasana nollattu!' : 'Sähköposti vahvistettu!'}</h1>
<p>${type === 'recovery' ? 'Voit nyt asettaa uuden salasanan.' : 'Tilisi on nyt aktiivinen.'}</p>
<a class="btn" id="openApp" href="${tackbirdUrl}">Avaa TackBird</a>
<p style="font-size:12px;margin-top:24px;color:#999;">Jos nappi ei toimi, avaa TackBird manuaalisesti.</p>
<script>
// Try to open the app automatically
setTimeout(function(){window.location.href="${expoUrl}";},500);
setTimeout(function(){window.location.href="${tackbirdUrl}";},1500);
</script>
</body></html>`, {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    })
  } catch (err) {
    return new Response('<h1>Virhe</h1><p>Yritä uudelleen.</p>', {
      status: 500,
      headers: { 'Content-Type': 'text/html' },
    })
  }
})
