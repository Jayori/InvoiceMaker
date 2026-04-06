const { SquareClient, SquareEnvironment } = require('square');
const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const square = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN,
  environment: process.env.SQUARE_ENVIRONMENT === 'production' ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
});
const resend = new Resend(process.env.RESEND_API_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { estimateId, depositAmount } = body;
  if (!estimateId || !depositAmount || depositAmount <= 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'estimateId and depositAmount required' }) };
  }

  // Get estimate
  const { data: estimate, error: estError } = await supabase
    .from('estimates').select('*').eq('id', estimateId).single();

  if (estError || !estimate) return { statusCode: 404, body: JSON.stringify({ error: 'Estimate not found' }) };

  // Get client passcode for redirect
  const { data: client } = await supabase
    .from('clients').select('passcode').eq('email', estimate.client_email).maybeSingle();

  const passcode = client?.passcode || '';
  const appUrl = process.env.APP_URL || '';
  const { data: business = {} } = await supabase.from('business_profile').select('*').eq('id', 1).single();

  // Create Square payment link for deposit
  let depositPaymentLink = null, depositOrderId = null;
  try {
    const result = await square.checkout.paymentLinks.create({
      idempotencyKey: crypto.randomUUID(),
      order: {
        locationId: process.env.SQUARE_LOCATION_ID,
        referenceId: `DEPOSIT-${estimate.estimate_number}`,
        lineItems: [{
          name: `Deposit — ${estimate.estimate_number}`.substring(0, 100),
          quantity: '1',
          basePriceMoney: { amount: BigInt(Math.round(depositAmount * 100)), currency: 'USD' },
        }],
      },
      checkoutOptions: { redirectUrl: `${appUrl}/client.html?paid=${passcode}` },
    });
    depositPaymentLink = result.paymentLink.url;
    depositOrderId = result.paymentLink.orderId;
  } catch (err) {
    console.error('Square error:', err);
    const detail = err.errors ? JSON.stringify(err.errors) : (err.message || String(err));
    return { statusCode: 502, body: JSON.stringify({ error: 'Square error', detail }) };
  }

  // Update estimate with deposit info
  const { error: updateError } = await supabase
    .from('estimates')
    .update({
      deposit_amount: depositAmount,
      deposit_payment_link: depositPaymentLink,
      deposit_order_id: depositOrderId,
      deposit_paid: false,
    })
    .eq('id', estimateId);

  if (updateError) return { statusCode: 502, body: JSON.stringify({ error: updateError.message }) };

  // Email the client
  try {
    const bizName = business?.name || 'Us';
    await resend.emails.send({
      from: process.env.FROM_EMAIL,
      to: estimate.client_email,
      subject: `Deposit Request from ${bizName} — $${Number(depositAmount).toFixed(2)}`,
      html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
  <tr><td style="background:#1a56db;padding:28px 40px;">
    <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;">${escHtml(bizName)}</h1>
    <p style="margin:4px 0 0;color:#bfdbfe;font-size:14px;">Deposit Request for Estimate ${escHtml(estimate.estimate_number)}</p>
  </td></tr>
  <tr><td style="padding:32px 40px;">
    <p style="font-size:15px;color:#374151;margin:0 0 16px;">Hi ${escHtml(estimate.client_name)},</p>
    <p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 24px;">A deposit has been requested to begin work on your project. Please click the button below to pay securely through Square.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border-radius:8px;border:1px solid #bfdbfe;margin:0 0 24px;">
      <tr><td style="padding:24px;text-align:center;">
        <p style="margin:0 0 6px;color:#1e40af;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Deposit Amount</p>
        <p style="margin:0 0 20px;font-size:40px;font-weight:800;color:#1a56db;letter-spacing:-0.02em;">$${Number(depositAmount).toFixed(2)}</p>
        <a href="${depositPaymentLink}" style="display:inline-block;background:#1a56db;color:#fff;text-decoration:none;padding:14px 40px;border-radius:6px;font-size:16px;font-weight:600;">Pay Deposit Now</a>
      </td></tr>
    </table>
    <p style="font-size:13px;color:#9ca3af;text-align:center;margin:0;">Secure payment powered by Square</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`,
    });
  } catch (err) { console.error('Resend error:', err); }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deposit_payment_link: depositPaymentLink, deposit_amount: depositAmount }),
  };
};
