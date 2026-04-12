// Shared TextBelt SMS helper
// Usage: await sendSms(phone, message)
// Returns: { success: true } or { success: false, error: '...' }

async function sendSms(phone, message) {
  const key = process.env.TEXTBELT_API_KEY;
  if (!key || !phone) return { success: false, error: 'No API key or phone' };

  // Normalize to E.164 (+1XXXXXXXXXX for US)
  const digits = phone.replace(/\D/g, '');
  let cleaned;
  if (digits.length === 10) cleaned = '+1' + digits;
  else if (digits.length === 11 && digits.startsWith('1')) cleaned = '+' + digits;
  else if (digits.length >= 10) cleaned = '+' + digits;
  else return { success: false, error: 'Invalid phone number' };

  try {
    console.log('SMS attempt — phone:', cleaned, 'key prefix:', key.substring(0, 8) + '...');
    const res = await fetch('https://textbelt.com/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: cleaned, message, key }),
    });
    const data = await res.json();
    console.log('TextBelt response:', JSON.stringify(data));
    if (!data.success) return { success: false, error: data.error || 'TextBelt error' };
    return { success: true };
  } catch (err) {
    console.error('SMS fetch error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { sendSms };
