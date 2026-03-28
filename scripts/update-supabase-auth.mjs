#!/usr/bin/env node

const PROJECT_REF = 'wfsghkseyyxkkalcqtzq';
const ACCESS_TOKEN = 'sbp_b67b425ca70501dbbebfc259640a25a08aba5836';

const confirmationTemplate = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vahvista tilisi – TackBird</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F5F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F5F5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:460px;background-color:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <!-- Header -->
          <tr>
            <td style="background-color:#2D6B5E;padding:32px 24px;text-align:center;">
              <div style="width:56px;height:56px;background-color:rgba(255,255,255,0.15);border-radius:50%;margin:0 auto 12px;line-height:56px;font-size:28px;">🐦</div>
              <h1 style="margin:0;color:#FFFFFF;font-size:22px;font-weight:700;letter-spacing:2px;">TACKBIRD</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 24px;">
              <h2 style="margin:0 0 8px;color:#1A1A1A;font-size:20px;font-weight:700;text-align:center;">Vahvista tilisi</h2>
              <p style="margin:0 0 24px;color:#666666;font-size:14px;line-height:1.5;text-align:center;">Syötä tämä koodi TackBird-sovellukseen:</p>
              <div style="background-color:#F5F5F5;border-radius:12px;padding:20px;text-align:center;margin:0 0 24px;">
                <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:#2D6B5E;font-family:'Courier New',Courier,monospace;">{{ .Token }}</span>
              </div>
              <p style="margin:0;color:#999999;font-size:13px;text-align:center;line-height:1.4;">Koodi vanhenee 60 minuutissa.<br>Jos et pyytänyt tätä koodia, voit jättää tämän viestin huomiotta.</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 24px 24px;text-align:center;border-top:1px solid #E5E5E5;">
              <p style="margin:0;color:#BBBBBB;font-size:12px;">© TackBird – Naapuruston oma ilmoitustaulu</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

const recoveryTemplate = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Salasanan nollaus – TackBird</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F5F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F5F5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:460px;background-color:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <!-- Header -->
          <tr>
            <td style="background-color:#2D6B5E;padding:32px 24px;text-align:center;">
              <div style="width:56px;height:56px;background-color:rgba(255,255,255,0.15);border-radius:50%;margin:0 auto 12px;line-height:56px;font-size:28px;">🐦</div>
              <h1 style="margin:0;color:#FFFFFF;font-size:22px;font-weight:700;letter-spacing:2px;">TACKBIRD</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 24px;">
              <h2 style="margin:0 0 8px;color:#1A1A1A;font-size:20px;font-weight:700;text-align:center;">Salasanan nollaus</h2>
              <p style="margin:0 0 24px;color:#666666;font-size:14px;line-height:1.5;text-align:center;">Syötä tämä koodi TackBird-sovellukseen nollataksesi salasanasi:</p>
              <div style="background-color:#F5F5F5;border-radius:12px;padding:20px;text-align:center;margin:0 0 24px;">
                <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:#2D6B5E;font-family:'Courier New',Courier,monospace;">{{ .Token }}</span>
              </div>
              <p style="margin:0;color:#999999;font-size:13px;text-align:center;line-height:1.4;">Koodi vanhenee 60 minuutissa.<br>Jos et pyytänyt salasanan nollausta, voit jättää tämän viestin huomiotta.</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 24px 24px;text-align:center;border-top:1px solid #E5E5E5;">
              <p style="margin:0;color:#BBBBBB;font-size:12px;">© TackBird – Naapuruston oma ilmoitustaulu</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

async function main() {
  try {
    // Update auth config
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        MAILER_AUTOCONFIRM: false,
        MAILER_OTP_LENGTH: 6,
        MAILER_OTP_EXP: 3600,
        MAILER_TEMPLATES_CONFIRMATION_CONTENT: confirmationTemplate,
        MAILER_TEMPLATES_CONFIRMATION_SUBJECT: 'Vahvista tilisi – TackBird',
        MAILER_TEMPLATES_RECOVERY_CONTENT: recoveryTemplate,
        MAILER_TEMPLATES_RECOVERY_SUBJECT: 'Salasanan nollaus – TackBird',
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('FAILED:', res.status, text);
      process.exit(1);
    }

    const data = await res.json();
    console.log('SUCCESS');
    console.log('MAILER_AUTOCONFIRM:', data.MAILER_AUTOCONFIRM);
    console.log('MAILER_OTP_LENGTH:', data.MAILER_OTP_LENGTH);
    console.log('MAILER_OTP_EXP:', data.MAILER_OTP_EXP);
    console.log('Confirmation subject:', data.MAILER_TEMPLATES_CONFIRMATION_SUBJECT);
    console.log('Recovery subject:', data.MAILER_TEMPLATES_RECOVERY_SUBJECT);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

main();
