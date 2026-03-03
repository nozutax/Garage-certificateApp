const https = require('https');

export default function handler(req, res) {
  // ---------------------------------------------------------
  // 1. セキュリティチェック（検問）強化版
  // ---------------------------------------------------------
  const referer = req.headers.referer || req.headers.origin;

  // 許可するドメインのリスト（本番環境のドメインとlocalhost）
  // ※ 'https://' から始まる完全なオリジンを指定してください
  const ALLOWED_ORIGINS = [
    'http://localhost:3000', // ローカル開発用
    'https://garage-certificate.vercel.app', // あなたの本番ドメイン例
    // 必要に応じて追加
  ];

  let isAllowed = false;

  if (referer) {
    try {
      // URLオブジェクトを使ってオリジン（プロトコル+ドメイン+ポート）だけを抽出
      // 例: "https://site.com/page?q=1" -> "https://site.com"
      const requestOrigin = new URL(referer).origin;
      
      // 完全一致でチェック（includeは使いません）
      // または、サブドメインを許可したい場合は endsWith を使うなどの工夫が必要です
      if (ALLOWED_ORIGINS.includes(requestOrigin)) {
        isAllowed = true;
      }
      
      // Vercelのプレビュー環境など、動的なドメイン許可が必要な場合の例（サブドメイン一致）:
      // if (requestOrigin.endsWith('.vercel.app') && requestOrigin.includes('garage-certificate')) {
      //   isAllowed = true;
      // }

    } catch (e) {
      console.error('Invalid URL in referer:', referer);
    }
  }

  // デバッグ用: 開発中はここをtrueにしておくと楽ですが、公開時は必ずfalse相当のロジックに戻してください
  // const isAllowed = true; 

  if (!isAllowed) {
    console.warn(`Blocked access from: ${referer || 'Unknown'}`);
    return res.status(403).json({ error: 'Forbidden: Access denied from this domain.' });
  }

  // ---------------------------------------------------------
  // 2. 設定部分
  // ---------------------------------------------------------
  const API_KEY = process.env.GOOGLE_MAPS_API_KEY;
  const { center, zoom } = req.query;

  if (!center || center.trim() === '') {
    return res.status(400).json({ error: 'center is required' });
  }

  if (!API_KEY) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // ---------------------------------------------------------
  // 3. 共通処理: 画像を返却する関数
  // ---------------------------------------------------------
  const zoomNum = Math.min(20, Math.max(1, parseInt(zoom, 10) || 15));
  const centerTrim = center.trim();
  const coordMatch = centerTrim.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);

  function sendStaticMap(centerForMap, xMapCenter) {
    const url = 'https://maps.googleapis.com/maps/api/staticmap?center=' +
      encodeURIComponent(centerForMap) +
      '&zoom=' + zoomNum +
      '&size=708x681&scale=2&maptype=roadmap&key=' + encodeURIComponent(API_KEY);

    if (xMapCenter) {
      res.setHeader('X-Map-Center', xMapCenter);
    }

    // ★重要: ブラウザキャッシュの設定（例: 24時間キャッシュ）
    // これにより、同じ場所の地図であれば再リクエスト時にAPI料金がかかりません
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');

    https.get(url, function (proxyRes) {
      if (proxyRes.statusCode !== 200) {
        let body = '';
        proxyRes.on('data', function (chunk) { body += chunk; });
        proxyRes.on('end', function () {
          // Googleからのエラー内容はログに出すが、クライアントには詳細を隠す（セキュリティ）
          console.error('Google API Error:', body);
          res.status(proxyRes.statusCode).json({ error: 'Failed to fetch map image' });
        });
        return;
      }

      res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'image/png');
      proxyRes.pipe(res);
    }).on('error', function (err) {
      res.status(502).json({ error: 'Upstream error' });
    });
  }

  // ---------------------------------------------------------
  // 4. ロジック実行
  // ---------------------------------------------------------

  // すでに座標の場合
  if (coordMatch) {
    const normCenter = coordMatch[1] + ',' + coordMatch[2];
    sendStaticMap(normCenter, normCenter);
    return;
  }

  // 住所の場合：Geocoding API
  const geocodeUrl =
    'https://maps.googleapis.com/maps/api/geocode/json?address=' +
    encodeURIComponent(centerTrim) +
    '&key=' + encodeURIComponent(API_KEY);

  https.get(geocodeUrl, function (geoRes) {
    let body = '';
    geoRes.on('data', function (chunk) { body += chunk; });
    geoRes.on('end', function () {
      try {
        const data = JSON.parse(body);
        if (data.status !== 'OK' || !data.results || data.results.length === 0) {
          // 住所が見つからない場合など
          res.status(400).json({ error: 'Location not found' });
          return;
        }
        const loc = data.results[0].geometry.location;
        const centerForMap = loc.lat + ',' + loc.lng;
        sendStaticMap(centerForMap, centerForMap);
      } catch (e) {
        res.status(502).json({ error: 'Invalid geocode response' });
      }
    });
  }).on('error', function (err) {
    res.status(502).json({ error: 'Geocode request failed' });
  });
}