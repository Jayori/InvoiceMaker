const { google } = require('googleapis');
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  const appUrl = process.env.APP_URL || '';
  const { code, state, error } = event.queryStringParameters || {};

  if (error) {
    return { statusCode: 302, headers: { Location: `${appUrl}/manager.html?gcal=error` }, body: '' };
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      // User previously authorized — need to revoke and reconnect to get a new refresh token
      return { statusCode: 302, headers: { Location: `${appUrl}/manager.html?gcal=reauth` }, body: '' };
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    await supabase.from('business_profile')
      .update({ gcal_refresh_token: tokens.refresh_token })
      .eq('id', 1);

    return { statusCode: 302, headers: { Location: `${appUrl}/manager.html?gcal=connected` }, body: '' };
  } catch (err) {
    console.error('OAuth callback error:', err);
    return { statusCode: 302, headers: { Location: `${appUrl}/manager.html?gcal=error` }, body: '' };
  }
};
