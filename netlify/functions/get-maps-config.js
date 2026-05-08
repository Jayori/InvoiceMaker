exports.handler = async () => {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '' }),
  };
};
