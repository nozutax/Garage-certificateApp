const https = require('https');

export default function handler(req, res) {
  // ---------------------------------------------------------
  // 1. セキュリティチェック（検問）強化版
  // ---------------------------------------------------------
  const referer = req.headers.referer || req.headers.origin || '';

  // Vercel本番とlocalhostだけを許可
  const isAllowed =
    referer.includes('https://garage-certificate-app.vercel.app') ||
    referer.includes('http://localhost:3000');

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