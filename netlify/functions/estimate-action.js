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

  const { estimateId, passcode, action, message } = body;
  if (!estimateId || !passcode || !action) {
    return { statusCode: 400, body: JSON.stringify({ error: 'estimateId, passcode, and action required' }) };
  }

  // Verify passcode matches client on this estimate
  const { data: estimate } = await supabase.from('estimates').select('*').eq('id', estimateId).single();
  if (!estimate) return { statusCode: 404, body: JSON.stringify({ error: 'Estimate not found' }) };

  const code = passcode.toUpperCase().trim();

  // Allow the estimate's own passcode field OR a matching client record passcode
  const estimatePasscodeMatch = estimate.passcode && estimate.passcode === code;
  let clientPasscodeMatch = false;
  if (!estimatePasscodeMatch) {
    const { data: client } = await supabase.from('clients').select('passcode').eq('email', estimate.client_email).maybeSingle();
    clientPasscodeMatch = !!(client && client.passcode === code);
  }

  if (!estimatePasscodeMatch && !clientPasscodeMatch) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Invalid access code' }) };
  }

  const { data: business } = await supabase.from('business_profile').select('*').eq('id', 1).single();
  const appUrl = process.env.APP_URL || '';

  if (action === 'approve' || action === 'reject') {
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    await supabase.from('estimates').update({ status: newStatus }).eq('id', estimateId);

    if (business?.email) {
      const word = action === 'approve' ? 'APPROVED ✓' : 'DECLINED';
      try {
        await resend.emails.send({
          from: process.env.FROM_EMAIL,
          to: business.email,
          subject: `Estimate ${word} — ${estimate.estimate_number} (${estimate.client_name})`,
          html: `<p style="font-family:Arial,sans-serif;font-size:15px;color:#374151;">
            <strong>${escHtml(estimate.client_name)}</strong> has <strong>${word}</strong> estimate
            <strong>${escHtml(estimate.estimate_number)}</strong> for <strong>$${Number(estimate.total).toFixed(2)}</strong>.
          </p>
          <p style="font-family:Arial,sans-serif;font-size:14px;color:#6b7280;">
            View it in your <a href="${appUrl}/manager.html" style="color:#1a56db;">manager dashboard</a>.
          </p>`,
        });
      } catch (err) { console.error('Resend error:', err); }
    }

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, status: newStatus }) };
  }

  if (action === 'message') {
    if (!message?.trim()) return { statusCode: 400, body: JSON.stringify({ error: 'Message required' }) };

    const { data: msg, error } = await supabase.from('estimate_messages').insert({
      estimate_id: estimateId,
      sender: 'client',
      message: message.trim(),
    }).select().single();

    if (error) return { statusCode: 502, body: JSON.stringify({ error: error.message }) };

    if (business?.email) {
      try {
        await resend.emails.send({
          from: process.env.FROM_EMAIL,
          to: business.email,
          subject: `Question about estimate ${estimate.estimate_number} — ${estimate.client_name}`,
          html: `<p style="font-family:Arial,sans-serif;font-size:15px;color:#374151;">
            <strong>${escHtml(estimate.client_name)}</strong> sent a question about estimate
            <strong>${escHtml(estimate.estimate_number)}</strong>:
          </p>
          <blockquote style="font-family:Arial,sans-serif;border-left:4px solid #e5e7eb;padding-left:16px;margin:16px 0;color:#374151;font-size:14px;">
            ${escHtml(message.trim())}
          </blockquote>
          <p style="font-family:Arial,sans-serif;font-size:14px;color:#6b7280;">
            Log into your <a href="${appUrl}/manager.html" style="color:#1a56db;">manager dashboard</a> to reply.
          </p>`,
        });
      } catch (err) { console.error('Resend error:', err); }
    }

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msg) };
  }

  return { statusCode: 400, body: JSON.stringify({ error: 'Unknown action' }) };
};
