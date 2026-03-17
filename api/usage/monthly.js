function isAllowedOrigin(req) {
  const referer = req.headers.referer || req.headers.origin || '';
  return (
    referer.includes('https://garage-certificate-app.vercel.app') ||
    referer.includes('.vercel.app') ||
    referer.includes('http://localhost')
  );
}

function json(res, status, data) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

function getBearerToken(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

async function getUserFromAccessToken({ supabaseUrl, apiKey, accessToken }) {
  const r = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!r.ok) return null;
  return await r.json();
}

export default async function handler(req, res) {
  if (!isAllowedOrigin(req)) return json(res, 403, { error: 'Forbidden' });
  if (req.method !== 'GET') return json(res, 405, { error: 'Method Not Allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json(res, 500, { error: 'Server configuration error' });
  }

  const accessToken = getBearerToken(req);
  if (!accessToken) return json(res, 401, { error: 'Missing bearer token' });

  const user = await getUserFromAccessToken({
    supabaseUrl: SUPABASE_URL,
    apiKey: SERVICE_ROLE_KEY,
    accessToken,
  });
  if (!user || !user.id) return json(res, 401, { error: 'Invalid token' });

  const url = new URL(`${SUPABASE_URL}/rest/v1/pdf_save_monthly_counts`);
  url.searchParams.set('select', 'month,count,updated_at');
  url.searchParams.set('user_id', `eq.${user.id}`);
  url.searchParams.set('order', 'month.desc');
  url.searchParams.set('limit', '12');

  const r = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });

  if (!r.ok) {
    const text = await r.text().catch(() => '');
    return json(res, 502, { error: 'Failed to fetch history', detail: text || undefined });
  }

  const rows = await r.json();
  const items = Array.isArray(rows)
    ? rows.map((x) => ({ month: x.month, count: x.count, updated_at: x.updated_at }))
    : [];
  return json(res, 200, { items });
}

