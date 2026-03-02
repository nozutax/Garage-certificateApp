# 地図APIプロキシ（APIキー隠し用）

## 使い方

1. 依存関係をインストール:
   ```bash
   npm install
   ```

2. 環境変数に Google Maps API キーを設定して起動:
   ```bash
   set GOOGLE_MAPS_API_KEY=あなたのAPIキー
   npm start
   ```
   （Linux/Mac の場合は `export GOOGLE_MAPS_API_KEY=あなたのAPIキー`）

3. ブラウザで `http://localhost:3000` を開く。`index.html` が表示され、地図はこのサーバー経由で取得されます（APIキーはブラウザに送られません）。

## デプロイ時

- 本番サーバー（Render, Heroku, VPS など）の環境変数に `GOOGLE_MAPS_API_KEY` を設定してください。
- ポートは `PORT` 環境変数で変更できます（未設定時は 3000）。
