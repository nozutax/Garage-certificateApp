const https = require('https');

export default function handler(req, res) {
  // ---------------------------------------------------------
  // 1. 設定部分
  // ---------------------------------------------------------
  const API_KEY = process.env.GOOGLE_MAPS_API_KEY;
  
  // あなたのVercelのURLを許可リストに入れます
  // (スクリーンショットにあったURLを記載しておきました)
  const ALLOWED_ORIGINS = [
    'https://garage-certificate-6gw5u8zzv-nozutaxs-projects.vercel.app',
    'http://localhost:3000'
  ];

  // ---------------------------------------------------------
  // 2. セキュリティチェック（検問）
  // ---------------------------------------------------------
  const referer = req.headers.referer || req.headers.origin;
  
  // 自分のサイト以外からのアクセスなら拒否する
  // (refererがない場合も弾きたい場合は条件を調整してください)
  const isAllowed = referer && ALLOWED_ORIGINS.some(origin => referer.startsWith(origin));

  if (!isAllowed) {
    // 開発中などで困る場合は、一旦ここをコメントアウトしてもOKです
    console.warn(`Blocked access from: ${referer || 'Unknown'}`);
    return res.status(403).json({ error: 'Forbidden: Access denied from this domain.' });
  }

  // ---------------------------------------------------------
  // 3. パラメータのチェック
  // ---------------------------------------------------------
  const { center, zoom } = req.query;

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

  // Google Static Maps APIのURLを作成
  const url = 'https://maps.googleapis.com/maps/api/staticmap?center=' +
    encodeURIComponent(center.trim()) +
    '&zoom=' + zoomNum +
    '&size=708x681&scale=2&maptype=roadmap&key=' + encodeURIComponent(API_KEY);

  // Googleから画像データを取得して、そのままブラウザに返す
  https.get(url, function (proxyRes) {
    if (proxyRes.statusCode !== 200) {
      let body = '';
      proxyRes.on('data', function (chunk) { body += chunk; });
      proxyRes.on('end', function () {
        res.status(proxyRes.statusCode).send('Google API Error: ' + body);
      });
      return;
    }
    
    // 画像データをそのまま流す
    res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'image/png');
    proxyRes.pipe(res);
  }).on('error', function (err) {
    res.status(502).send('Upstream error: ' + err.message);
  });
}