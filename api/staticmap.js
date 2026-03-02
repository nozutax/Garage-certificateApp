const https = require('https');

export default function handler(req, res) {
  // ---------------------------------------------------------
  // 1. セキュリティチェック（検問）修正版
  // ---------------------------------------------------------
  const referer = req.headers.referer || req.headers.origin;

  // ★変更点：URLが完全に一致しなくても、
  // 「プロジェクト名」か「localhost」が含まれていればOKにします。
  const isAllowed = referer && (
    referer.includes('garage-certificate') || // プロジェクト名が含まれていればOK
    referer.includes('localhost')             // 自分のPCでの開発もOK
  );

  // もしチェック自体を無効にして、とにかく動かしたい場合は
  // 上のコードを消して、単に const isAllowed = true; と書いてください。

  if (!isAllowed) {
    // どのURLから来てブロックされたかログに残す（Vercelの管理画面で見れます）
    console.warn(`Blocked access from: ${referer || 'Unknown'}`);
    return res.status(403).json({ error: 'Forbidden: Access denied from this domain.' });
  }

  // ---------------------------------------------------------
  // 2. 設定部分
  // ---------------------------------------------------------
  const API_KEY = process.env.GOOGLE_MAPS_API_KEY;
  const { center, zoom } = req.query;

  // ---------------------------------------------------------
  // 3. パラメータのチェック
  // ---------------------------------------------------------
  if (!center || center.trim() === '') {
    return res.status(400).json({ error: 'center is required' });
  }

  if (!API_KEY) {
    return res.status(500).json({ error: 'Server configuration error: API Key missing' });
  }

  // ---------------------------------------------------------
  // 4. Googleへの問い合わせ
  // ---------------------------------------------------------
  const zoomNum = Math.min(20, Math.max(1, parseInt(zoom, 10) || 15));

  const url = 'https://maps.googleapis.com/maps/api/staticmap?center=' +
    encodeURIComponent(center.trim()) +
    '&zoom=' + zoomNum +
    '&size=708x681&scale=2&maptype=roadmap&key=' + encodeURIComponent(API_KEY);

  https.get(url, function (proxyRes) {
    if (proxyRes.statusCode !== 200) {
      let body = '';
      proxyRes.on('data', function (chunk) { body += chunk; });
      proxyRes.on('end', function () {
        res.status(proxyRes.statusCode).send('Google API Error: ' + body);
      });
      return;
    }
    
    res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'image/png');
    proxyRes.pipe(res);
  }).on('error', function (err) {
    res.status(502).send('Upstream error: ' + err.message);
  });
}