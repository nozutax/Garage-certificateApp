function isAllowedOrigin(req) {
  const referer = req.headers.referer || req.headers.origin || '';
  return (
    referer.includes('https://garage-certificate-app.vercel.app') ||
    referer.includes('http://localhost:3000')
  );
}

function json(res, status, data) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

export default function handler(req, res) {
  if (!isAllowedOrigin(req)) return json(res, 403, { error: 'Forbidden' });
  if (req.method !== 'POST') return json(res, 405, { error: 'Method Not Allowed' });

  const ADMIN_PANEL_SECRET = process.env.ADMIN_PANEL_SECRET;
  if (!ADMIN_PANEL_SECRET) {
    return json(res, 500, { error: 'Server configuration error' });
  }

  const supplied = (req.headers['x-admin-secret'] || '').toString();
  if (!supplied || supplied !== ADMIN_PANEL_SECRET) {
    return json(res, 401, { error: 'Unauthorized' });
  }

  return json(res, 200, { ok: true });
}
