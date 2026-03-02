const express = require('express');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

const API_KEY = process.env.GOOGLE_MAPS_API_KEY;

app.get('/api/staticmap', function (req, res) {
  const center = req.query.center;
  const zoom = req.query.zoom;

  if (!center || center.trim() === '') {
    res.status(400).json({ error: 'center is required' });
    return;
  }

  if (!API_KEY) {
    res.status(500).json({ error: 'GOOGLE_MAPS_API_KEY is not configured' });
    return;
  }

  const zoomNum = Math.min(20, Math.max(14, parseInt(zoom, 10) || 19));
  const url = 'https://maps.googleapis.com/maps/api/staticmap?center=' +
    encodeURIComponent(center.trim()) +
    '&zoom=' + zoomNum +
    '&size=708x681&scale=2&maptype=roadmap&key=' + encodeURIComponent(API_KEY);

  https.get(url, function (proxyRes) {
    if (proxyRes.statusCode !== 200) {
      let body = '';
      proxyRes.on('data', function (chunk) { body += chunk; });
      proxyRes.on('end', function () {
        res.status(proxyRes.statusCode).type('text/plain').send(body || proxyRes.statusMessage);
      });
      return;
    }
    res.set('Content-Type', proxyRes.headers['content-type'] || 'image/png');
    proxyRes.pipe(res);
  }).on('error', function (err) {
    res.status(502).type('text/plain').send('Upstream error: ' + err.message);
  });
});

app.use(express.static(path.join(__dirname, '..')));

app.listen(PORT, function () {
  console.log('Server listening on port', PORT);
  if (!API_KEY) {
    console.warn('Warning: GOOGLE_MAPS_API_KEY is not set. /api/staticmap will return 500.');
  }
});
