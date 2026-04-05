const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');

const resend = new Resend(process.env.RESEND_API_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { estimateId, message } = body;
  if (!estimateId || !message?.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: 'estimateId and message required' }) };
  }

  const { data: estimate } = await supabase.from('estimates').select('*').eq('id', estimateId).single();
  if (!estimate) return { statusCode: 404, body: JSON.stringify({ error: 'Estimate not found' }) };

  const { data: msg, error } = await supabase.from('estimate_messages').insert({
    estimate_id: estimateId,
    sender: 'manager',
    message: message.trim(),
  }).select().single();

  if (error) return { statusCode: 502, body: JSON.stringify({ error: error.message }) };

  const { data: business } = await supabase.from('business_profile').select('name').eq('id', 1).single();
  const appUrl = process.env.APP_URL || '';

  try {
    await resend.emails.send({
      from: process.env.FROM_EMAIL,
      to: estimate.client_email,
      subject: `Reply to your question — ${estimate.estimate_number}`,
      html: `<p style="font-family:Arial,sans-serif;font-size:15px;color:#374151;">
        <strong>${escHtml(business?.name || 'We')}</strong> replied to your question about estimate
        <strong>${escHtml(estimate.estimate_number)}</strong>:
      </p>
      <blockquote style="font-family:Arial,sans-serif;border-left:4px solid #0f766e;padding-left:16px;margin:16px 0;color:#374151;font-size:14px;">
        ${escHtml(message.trim())}
      </blockquote>
      <p style="font-family:Arial,sans-serif;font-size:14px;color:#6b7280;">
        Log in at <a href="${appUrl}/client.html" style="color:#0f766e;">${appUrl}/client.html</a> with your access code to view the full conversation and respond.
      </p>`,
    });
  } catch (err) { console.error('Resend error:', err); }

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msg) };
};
