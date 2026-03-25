# PDF 文字列削除アプリ

ブラウザ内で PDF を開き、選択した文字列を redaction して再ダウンロードする静的 Web アプリです。  
サーバーは不要で、GitHub Pages へそのまま配置できます。

## 現在の構成

- フロントエンド: React + Vite
- PDF Viewer / Engine: `@embedpdf/react-pdf-viewer` + PDFium WebAssembly
- テスト: Vitest + jsdom
- 出力: 完全静的ファイル (`dist/`)

## ローカル起動

```bash
npm install
npx playwright install chromium
npm run dev
```

起動後:

```text
http://127.0.0.1:5173
```

## テスト

```bash
npx playwright install chromium
npm test
```

## 本番ビルド

```bash
npm run build
```

生成物は `dist/` に出力されます。GitHub Pages workflow でも `dist/` をそのまま deploy します。

## Third-party assets and licenses

- `pdfium.wasm` は source control せず、build 時に installed package の `@embedpdf/pdfium` から `dist/` へ取り込みます。
- third-party license 原文は build artifact の `dist/licenses/` 配下に同梱されます。
- アプリ UI のヘッダー右にある `Licenses` アイコンから、同梱済み原文へ直接アクセスできます。
- 将来 font file を配布する場合は、対応する `@embedpdf/fonts-*` の `LICENSE` も同時コピー対象にします。

## GitHub Pages 公開

GitHub Actions で自動 deploy できます。

1. GitHub の `Settings > Pages` を開く
2. `Build and deployment` の `Source` を `GitHub Actions` にする
3. `main` へ push する

追加した workflow は次を実行します。

- `pull_request`: `npm test` と `npm run build`
- `push` to `main`: `npm test` と `npm run build` のあと Pages へ deploy
- `workflow_dispatch`: `main` 上で手動実行すると同じ内容で deploy

テストでは Playwright の Chromium をインストールしてから `npm test` を実行します。  
deploy 対象は `dist/` です。

## 使い方

ヘッダー右の Help アイコンから、アプリ内でも同じ手順を確認できます。

1. `PDFを選択` でローカル PDF を開く
2. PDF 上の文字列をドラッグ選択する
3. `選択範囲を追加` を押す
4. 必要なら `最後を取り消す` または `すべてクリア`
5. `削除してダウンロード` を押す

## 実装メモ

- Redaction は PDFium WASM をブラウザ内で実行して適用します。
- `dist/pdfium.wasm` は build 後に `@embedpdf/pdfium` package からコピーして初期化します。
- 旧構成の `FastAPI + PyMuPDF` は廃止しました。
- 一覧表示の undo/clear は UI 側でグループ管理しています。

## 制約

- 通常の横書きテキスト PDF を主対象にしています。
- 複雑な組版、OCR 前提 PDF、特殊フォント PDF では選択精度に差が出ることがあります。
