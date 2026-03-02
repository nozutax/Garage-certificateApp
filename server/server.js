const express = require('express');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

// Vercelに設定した環境変数を読み込みます
const API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// ★【重要】ここにあなたのVercelのURLを書き込んでください
// これが「許可リスト」になります。自分のサイトと、開発用のlocalhostだけを許可します。
const ALLOWED_ORIGINS = [
  'https://garage-certificate-app.vercel.app/', // ←ここをあなたの本番URLに変える！
  'http://localhost:3000'                   // ローカル開発用（そのままでOK）
];

app.get('/api/staticmap', function (req, res) {
  // ---------------------------------------------------------
  // 1. セキュリティチェック（検問）
  // ---------------------------------------------------------
  // リクエストがどこから来たか（RefererまたはOrigin）を確認します
  const referer = req.headers.referer || req.headers.origin;
  
  // 開発環境などでブラウザ以外から直接叩いた場合など、refererがないこともあります。
  // その場合も弾く設定にしていますが、もし困る場合は !referer の条件を外してください。
  const isAllowed = referer && ALLOWED_ORIGINS.some(origin => referer.startsWith(origin));

  if (!isAllowed) {
    console.warn(`Blocked access from: ${referer || 'Unknown'}`);
    // 許可リストになければ 403 Forbidden（立入禁止）を返して終了
    return res.status(403).json({ error: 'Forbidden: Access denied from this domain.' });
  }

  // ---------------------------------------------------------
  // 2. パラメータのチェック
  // ---------------------------------------------------------
  const center = req.query.center;
  const zoom = req.query.zoom;

  if (!center || center.trim() === '') {
    res.status(400).json({ error: 'center is required' });
    return;
  }

  if (!API_KEY) {
    // サーバー側の設定ミスなので500エラー
    res.status(500).json({ error: 'Server configuration error: API Key missing' });
    return;
  }

  // ---------------------------------------------------------
  // 3. Googleへの問い合わせ
  // ---------------------------------------------------------
  // ズームレベルの調整（範囲外の数値を入れられないように制限）
  const zoomNum = Math.min(20, Math.max(1, parseInt(zoom, 10) || 15));

  // Google Static Maps APIのURLを作成（キーはここでサーバーがくっつける）
  const url = 'https://maps.googleapis.com/maps/api/staticmap?center=' +
    encodeURIComponent(center.trim()) +
    '&zoom=' + zoomNum +
    '&size=708x681&scale=2&maptype=roadmap&key=' + encodeURIComponent(API_KEY);

  // Googleから画像データを取得して、そのままブラウザに中継（パイプ）する
  https.get(url, function (proxyRes) {
    if (proxyRes.statusCode !== 200) {
      let body = '';
      proxyRes.on('data', function (chunk) { body += chunk; });
      proxyRes.on('end', function () {
        // Googleからエラーが返ってきた場合
        res.status(proxyRes.statusCode).type('text/plain').send('Google API Error: ' + body);
      });
      return;
    }
    // 成功した場合、画像として返す
    res.set('Content-Type', proxyRes.headers['content-type'] || 'image/png');
    proxyRes.pipe(res);
  }).on('error', function (err) {
    res.status(502).type('text/plain').send('Upstream error: ' + err.message);
  });
});

// 静的ファイルの配信（フロントエンド用）
app.use(express.static(path.join(__dirname, '..')));

app.listen(PORT, function () {
  console.log('Server listening on port', PORT);
  if (!API_KEY) {
    console.warn('Warning: GOOGLE_MAPS_API_KEY is not set.');
  }
});