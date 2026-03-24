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

生成物は `dist/` に出力されます。Vite の `base` は相対パス設定なので、GitHub Pages の project pages 配下でもそのまま配信できます。

## GitHub Pages 公開

1. `npm install`
2. `npm run build`
3. `dist/` の内容を Pages の公開対象にする

Actions で自動化する場合は `dist/` を artifact/deploy 対象にしてください。

## 使い方

1. `PDFを選択` でローカル PDF を開く
2. PDF 上の文字列をドラッグ選択する
3. `選択範囲を追加` を押す
4. 必要なら `最後を取り消す` または `すべてクリア`
5. `削除してダウンロード` を押す

## 実装メモ

- Redaction は PDFium WASM をブラウザ内で実行して適用します。
- `public/pdfium.wasm` を静的配信して初期化します。
- 旧構成の `FastAPI + PyMuPDF` は廃止しました。
- 一覧表示の undo/clear は UI 側でグループ管理しています。

## 制約

- 通常の横書きテキスト PDF を主対象にしています。
- 複雑な組版、OCR 前提 PDF、特殊フォント PDF では選択精度に差が出ることがあります。
