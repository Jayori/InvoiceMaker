// Shared TextBelt SMS helper
// Usage: await sendSms(phone, message)
// Returns: { success: true } or { success: false, error: '...' }

async function sendSms(phone, message) {
  const key = process.env.TEXTBELT_API_KEY;
  if (!key || !phone) return { success: false, error: 'No API key or phone' };

  // Strip non-digits, keep + prefix if present
  const cleaned = phone.replace(/[^\d+]/g, '');
  if (cleaned.replace(/\D/g, '').length < 10) return { success: false, error: 'Invalid phone number' };

  try {
    const res = await fetch('https://textbelt.com/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: cleaned, message, key }),
    });
    const data = await res.json();
    if (!data.success) return { success: false, error: data.error || 'TextBelt error' };
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { sendSms };
