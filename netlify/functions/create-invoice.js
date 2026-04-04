const { Client, Environment } = require('square');
const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const square = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment:
    process.env.SQUARE_ENVIRONMENT === 'production'
      ? Environment.Production
      : Environment.Sandbox,
});

const resend = new Resend(process.env.RESEND_API_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function generateInvoiceNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const random = Math.floor(Math.random() * 9000) + 1000;
  return `INV-${year}-${random}`;
}

function buildEmailHtml({ invoiceNumber, clientName, items, subtotal, taxRate, taxAmount, total, dueDate, notes, paymentLink }) {
  const itemRows = items.map(item => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;">${escapeHtml(item.description)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${item.quantity}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">$${Number(item.unitPrice).toFixed(2)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">$${(item.quantity * item.unitPrice).toFixed(2)}</td>
    </tr>
  `).join('');

  const dueDateStr = dueDate
    ? new Date(dueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'Upon receipt';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#1a56db;padding:32px 40px;">
            <h1 style="margin:0;color:#fff;font-size:28px;font-weight:700;">Invoice</h1>
            <p style="margin:4px 0 0;color:#bfdbfe;font-size:16px;">${escapeHtml(invoiceNumber)}</p>
          </td>
        </tr>

        <!-- Client & Due Date -->
        <tr>
          <td style="padding:32px 40px 0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <p style="margin:0 0 4px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Billed To</p>
                  <p style="margin:0;color:#111827;font-size:16px;font-weight:600;">${escapeHtml(clientName)}</p>
                </td>
                <td align="right">
                  <p style="margin:0 0 4px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Due Date</p>
                  <p style="margin:0;color:#111827;font-size:16px;font-weight:600;">${dueDateStr}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Line Items -->
        <tr>
          <td style="padding:24px 40px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
              <thead>
                <tr style="background:#f9fafb;">
                  <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e5e7eb;">Description</th>
                  <th style="padding:10px 12px;text-align:center;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e5e7eb;">Qty</th>
                  <th style="padding:10px 12px;text-align:right;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e5e7eb;">Price</th>
                  <th style="padding:10px 12px;text-align:right;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e5e7eb;">Total</th>
                </tr>
              </thead>
              <tbody>${itemRows}</tbody>
            </table>
          </td>
        </tr>

        <!-- Totals -->
        <tr>
          <td style="padding:16px 40px 0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="60%"></td>
                <td>
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding:6px 0;color:#6b7280;">Subtotal</td>
                      <td style="padding:6px 0;text-align:right;color:#111827;">$${Number(subtotal).toFixed(2)}</td>
                    </tr>
                    ${taxRate > 0 ? `
                    <tr>
                      <td style="padding:6px 0;color:#6b7280;">Tax (${taxRate}%)</td>
                      <td style="padding:6px 0;text-align:right;color:#111827;">$${Number(taxAmount).toFixed(2)}</td>
                    </tr>` : ''}
                    <tr>
                      <td style="padding:10px 0 0;border-top:2px solid #e5e7eb;font-weight:700;font-size:18px;color:#111827;">Total Due</td>
                      <td style="padding:10px 0 0;border-top:2px solid #e5e7eb;text-align:right;font-weight:700;font-size:18px;color:#1a56db;">$${Number(total).toFixed(2)}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        ${notes ? `
        <!-- Notes -->
        <tr>
          <td style="padding:24px 40px 0;">
            <p style="margin:0 0 6px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Notes</p>
            <p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">${escapeHtml(notes)}</p>
          </td>
        </tr>` : ''}

        <!-- Pay Button -->
        <tr>
          <td style="padding:32px 40px;" align="center">
            <a href="${paymentLink}" style="display:inline-block;background:#1a56db;color:#fff;text-decoration:none;padding:14px 40px;border-radius:6px;font-size:16px;font-weight:600;letter-spacing:0.02em;">Pay Now — $${Number(total).toFixed(2)}</a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:0 40px 32px;text-align:center;">
            <p style="margin:0;color:#9ca3af;font-size:13px;">Secure payment powered by Square</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { clientName, clientEmail, items, taxRate = 0, notes, dueDate } = body;

  if (!clientName || !clientEmail || !items || !items.length) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'clientName, clientEmail, and at least one item are required' }),
    };
  }

  // Calculate totals
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  const invoiceNumber = generateInvoiceNumber();

  // 1. Create Square payment link
  let squarePaymentLink = null;
  let squareOrderId = null;

  try {
    const lineItems = items.map(item => ({
      name: item.description.substring(0, 100),
      quantity: String(item.quantity),
      basePriceMoney: {
        amount: BigInt(Math.round(item.unitPrice * 100)),
        currency: 'USD',
      },
    }));

    // Add tax as a line item if applicable
    if (taxRate > 0) {
      lineItems.push({
        name: `Tax (${taxRate}%)`,
        quantity: '1',
        basePriceMoney: {
          amount: BigInt(Math.round(taxAmount * 100)),
          currency: 'USD',
        },
      });
    }

    const { result } = await square.checkoutApi.createPaymentLink({
      idempotencyKey: crypto.randomUUID(),
      order: {
        locationId: process.env.SQUARE_LOCATION_ID,
        referenceId: invoiceNumber,
        lineItems,
      },
      checkoutOptions: {
        redirectUrl: `${process.env.APP_URL}/?paid=${invoiceNumber}`,
      },
    });

    squarePaymentLink = result.paymentLink.url;
    squareOrderId = result.paymentLink.orderId;
  } catch (err) {
    console.error('Square error:', err);
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Failed to create Square payment link', detail: err.message }),
    };
  }

  // 2. Save to Supabase
  const { data: invoice, error: dbError } = await supabase
    .from('invoices')
    .insert({
      invoice_number: invoiceNumber,
      client_name: clientName,
      client_email: clientEmail,
      items,
      subtotal,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      total,
      notes: notes || null,
      due_date: dueDate || null,
      square_payment_link: squarePaymentLink,
      square_order_id: squareOrderId,
    })
    .select()
    .single();

  if (dbError) {
    console.error('Supabase error:', dbError);
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Failed to save invoice', detail: dbError.message }),
    };
  }

  // 3. Send email via Resend
  try {
    await resend.emails.send({
      from: process.env.FROM_EMAIL,
      to: clientEmail,
      subject: `Invoice ${invoiceNumber} — $${total.toFixed(2)} due`,
      html: buildEmailHtml({
        invoiceNumber,
        clientName,
        items,
        subtotal,
        taxRate,
        taxAmount,
        total,
        dueDate,
        notes,
        paymentLink: squarePaymentLink,
      }),
    });
  } catch (err) {
    console.error('Resend error:', err);
    // Non-fatal: invoice is saved and payment link exists, just log the email failure
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(invoice),
  };
};
