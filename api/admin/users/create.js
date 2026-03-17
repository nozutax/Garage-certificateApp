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

async function readJsonBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(Buffer.from(c));
  if (chunks.length === 0) return null;
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return null;
  return JSON.parse(text);
}

export default async function handler(req, res) {
  if (!isAllowedOrigin(req)) return json(res, 403, { error: 'Forbidden' });
  if (req.method !== 'POST') return json(res, 405, { error: 'Method Not Allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ADMIN_PANEL_SECRET = process.env.ADMIN_PANEL_SECRET;

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ADMIN_PANEL_SECRET) {
    return json(res, 500, { error: 'Server configuration error' });
  }

  const supplied = (req.headers['x-admin-secret'] || '').toString();
  if (!supplied || supplied !== ADMIN_PANEL_SECRET) {
    return json(res, 401, { error: 'Unauthorized' });
  }

  let body = null;
  try {
    body = await readJsonBody(req);
  } catch (_) {
    return json(res, 400, { error: 'Invalid JSON body' });
  }

  const email = body && typeof body.email === 'string' ? body.email.trim() : '';
  const password = body && typeof body.password === 'string' ? body.password : '';
  if (!email || !password) return json(res, 400, { error: 'email and password are required' });

  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
    }),
  });

  const dataText = await r.text().catch(() => '');
  if (!r.ok) {
    return json(res, 502, { error: 'Failed to create user', detail: dataText || undefined });
  }

  let data = null;
  try {
    data = dataText ? JSON.parse(dataText) : null;
  } catch (_) {
    data = null;
  }

  const userId = data && data.user ? data.user.id : data && data.id ? data.id : undefined;
  const userEmail = data && data.user ? data.user.email : data && data.email ? data.email : email;

  return json(res, 200, { user_id: userId, email: userEmail });
}

