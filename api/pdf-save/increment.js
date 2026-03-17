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

function monthKeyFromDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(Buffer.from(c));
  if (chunks.length === 0) return null;
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return null;
  return JSON.parse(text);
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
  if (req.method !== 'POST') return json(res, 405, { error: 'Method Not Allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json(res, 500, { error: 'Server configuration error' });
  }

  const accessToken = getBearerToken(req);
  if (!accessToken) return json(res, 401, { error: 'Missing bearer token' });

  let body = null;
  try {
    body = await readJsonBody(req);
  } catch (_) {
    return json(res, 400, { error: 'Invalid JSON body' });
  }

  const requestedMonth = body && typeof body.month === 'string' ? body.month.trim() : '';
  const month = requestedMonth || monthKeyFromDate(new Date());
  if (!/^\d{4}-\d{2}$/.test(month)) return json(res, 400, { error: 'Invalid month format' });

  const user = await getUserFromAccessToken({
    supabaseUrl: SUPABASE_URL,
    apiKey: SERVICE_ROLE_KEY,
    accessToken,
  });
  if (!user || !user.id) return json(res, 401, { error: 'Invalid token' });

  // Call RPC for atomic increment
  const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_pdf_save_monthly`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_user_id: user.id, p_month: month }),
  });

  if (!rpcRes.ok) {
    const text = await rpcRes.text().catch(() => '');
    return json(res, 502, { error: 'Failed to increment', detail: text || undefined });
  }

  const row = await rpcRes.json();
  return json(res, 200, { month: row.month, count: row.count, updated_at: row.updated_at });
}

