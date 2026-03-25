# License Investigation

Date: 2026-03-25
Repository: `pdf-redactor`
Scope: engineering-oriented pre-implementation investigation only. No behavior change was implemented.

## 1. Executive Summary

- 現在の `public/pdfium.wasm` は、`node_modules/@embedpdf/pdfium/dist/pdfium.wasm` と同一バイナリです。`sha256sum` では `public/`、`node_modules/`、`dist/` 内の wasm がすべて一致しました。
- 実ビルド後の `dist/` には `dist/pdfium.wasm` と `dist/assets/pdfium-*.wasm` の 2 個が共存しており、現状は pdfium wasm が二重配布されています。
- したがって、`public` 直置きをやめて build 時コピーに寄せる方針自体は妥当です。ただし、それだけでは重複 wasm もライセンス同梱要件も解決しません。
- 最小構成としては、`node_modules` を唯一の出所として wasm とライセンス原文を build 時に `dist/` へ配置し、`dist/licenses/...` へのリンクを UI から辿れるようにする案が成立します。
- 現在の `dist/` には font / license / notice / txt の物理ファイルは入っていません。font package は依存にありますが、現行 build では配布されていません。
- repo ルートには `LICENSE` が存在せず、第三者ライセンス対応とは別に、自作コードの公開条件未定義という論点があります。
- 実装着手は可能ですが、「重複 wasm を許容するか」「UI で全文表示するかリンク表示に留めるか」「repo 自身の LICENSE を何にするか」は人間判断が残っています。

## 2. Current Distribution Flow

### 2.1 Current app-side flow for `pdfium.wasm`

Evidence:

- `package.json` では build が `vite build` のみです。Vite 設定ファイルは repo 直下に存在しません。
  - `package.json:6-18`
- アプリは `src/App.jsx` で `const pdfiumWasmUrl = \`${import.meta.env.BASE_URL}pdfium.wasm\`;` を作り、`PDFViewer` に `config.wasmUrl` として渡しています。
  - `src/App.jsx:20`
  - `src/App.jsx:430-433`
- `public/pdfium.wasm` が実在します。
  - actual file: `public/pdfium.wasm`
- GitHub Pages workflow は `npm ci` -> `npm run build` -> `./dist` を artifact upload しています。
  - `.github/workflows/pages.yml:31-32`
  - `.github/workflows/pages.yml:54-64`

Observed flow:

1. `public/pdfium.wasm`
2. `vite build`
3. `dist/pdfium.wasm`
4. GitHub Pages workflow uploads `./dist`
5. Pages serves the file as part of the deployed artifact

### 2.2 Package-side flow that also emits a wasm asset

Evidence:

- `@embedpdf/pdfium` package exports `./pdfium.wasm` explicitly.
  - `node_modules/@embedpdf/pdfium/package.json:11-27`
- `@embedpdf/pdfium/dist/index.browser.js` contains bundler-friendly `new URL('pdfium.wasm', import.meta.url).href`.
  - `node_modules/@embedpdf/pdfium/dist/index.browser.js:1200-1202` from `rg -n`
- Built `dist/assets/direct-engine-*.js` contains `new URL('/assets/pdfium-....wasm', '' + import.meta.url).href`.
  - observed in `dist/assets/direct-engine-C05qd3GS-fMXZ032_.js`

Observed additional flow:

1. `node_modules/@embedpdf/pdfium/dist/pdfium.wasm`
2. `@embedpdf/pdfium/dist/index.browser.js` references it via `new URL(...)`
3. Vite emits `dist/assets/pdfium-6UaCOAE8.wasm`
4. It is uploaded with the rest of `dist`

### 2.3 Public files that pass through to final output

Current `public/` inventory:

- `public/pdfium.wasm`

Observed final output counterpart:

- `dist/pdfium.wasm`

There are no other files under `public/`.

## 3. Build Output Inventory

### 3.1 Commands run

```bash
npm ci
npm run build
find dist -type f | sort
find dist -type f | rg -i '\.(wasm|woff2?|ttf|otf|eot|license|licenses|notice|txt)$'
sha256sum public/pdfium.wasm node_modules/@embedpdf/pdfium/dist/pdfium.wasm node_modules/@embedpdf/snippet/dist/pdfium.wasm dist/pdfium.wasm dist/assets/pdfium-*.wasm
```

### 3.2 Main `dist/` files actually produced

| Path | Size (bytes) | Notes |
| --- | ---: | --- |
| `dist/index.html` | 498 | Entry HTML |
| `dist/pdfium.wasm` | 4,519,882 | Public passthrough wasm |
| `dist/assets/pdfium-6UaCOAE8.wasm` | 4,519,882 | Bundled/package-emitted wasm |
| `dist/assets/index-DU8S9xGm.js` | 199,300 | App bundle |
| `dist/assets/embedpdf-CvD-utXp-Cf719l3-.js` | 889,431 | EmbedPDF/snippet bundle |
| `dist/assets/direct-engine-C05qd3GS-fMXZ032_.js` | 273,095 | Direct PDF engine chunk |
| `dist/assets/worker-engine-CmPhyK3p-CaH1XVwA.js` | 634,462 | Worker engine chunk |
| `dist/assets/browser-BISJ9naB-Do5Ppf0u-izo5AEZq.js` | 16,530 | Browser helper chunk |
| `dist/assets/index-Dw4YTwYG.css` | 3,298 | CSS |
| `dist/assets/PdfViewerPane-BItApuuF.js` | 779 | Lazy chunk |
| `dist/assets/preload-helper-KkYwuwE8.js` | 2,129 | Runtime helper |

### 3.3 Presence of wasm / font / license / notice / text assets

Observed in `dist/`:

- `wasm`: Yes
  - `dist/pdfium.wasm`
  - `dist/assets/pdfium-6UaCOAE8.wasm`
- `font`: No standalone `.ttf/.otf/.woff/.woff2` files found
- `license`: No standalone `LICENSE*` files found
- `notice`: No standalone `NOTICE*` files found
- `text asset`: No standalone `.txt` license/notice files found

### 3.4 Third-party assets actually distributed today

Actually distributed as standalone non-code assets:

- PDFium wasm: yes, twice

Not distributed as standalone assets in current build:

- EmbedPDF font package files
- Any third-party license/notice texts
- Any third-party image assets
- Any demo PDFs from `@embedpdf/snippet`

### 3.5 Hash evidence for wasm provenance

`sha256sum` result:

```text
d8d2aa77b9899cdd0dc5aa6114f68e32dac294389896f81854b3672a93c67dd4  public/pdfium.wasm
d8d2aa77b9899cdd0dc5aa6114f68e32dac294389896f81854b3672a93c67dd4  node_modules/@embedpdf/pdfium/dist/pdfium.wasm
d8d2aa77b9899cdd0dc5aa6114f68e32dac294389896f81854b3672a93c67dd4  node_modules/@embedpdf/snippet/dist/pdfium.wasm
d8d2aa77b9899cdd0dc5aa6114f68e32dac294389896f81854b3672a93c67dd4  dist/pdfium.wasm
d8d2aa77b9899cdd0dc5aa6114f68e32dac294389896f81854b3672a93c67dd4  dist/assets/pdfium-6UaCOAE8.wasm
```

Conclusion from the hash:

- `public/pdfium.wasm` is not a custom forked binary in this repo.
- It is currently a checked-in copy of the same binary that already exists in installed EmbedPDF packages.

## 4. Dependency License Evidence

`npm ls` showed the actual installed EmbedPDF graph in use:

- `@embedpdf/react-pdf-viewer@2.9.1`
- `@embedpdf/snippet@2.9.1`
- `@embedpdf/core@2.9.1`
- `@embedpdf/engines@2.9.1`
- `@embedpdf/models@2.9.1`
- `@embedpdf/pdfium@2.9.1`
- `@embedpdf/fonts-* @ 1.0.0`
- multiple `@embedpdf/plugin-* @ 2.9.1`

### 4.1 Package table

| Package | Version | Declared license | Found license files | Redistributable asset files found in package | Notes |
| --- | --- | --- | --- | --- | --- |
| `@embedpdf/react-pdf-viewer` | `2.9.1` | `MIT` | `LICENSE` | none | `files` includes `dist` and `README.md`; no standalone wasm/font asset in package root. |
| `@embedpdf/snippet` | `2.9.1` | `MIT` | `LICENSE` | `dist/pdfium.wasm`, `dist/demo.pdf`, `dist/demo-annotations.pdf`, `dist/ebook.pdf` | This app bundles its JS. Current app build does not copy demo PDFs, but package does physically contain them. |
| `@embedpdf/core` | `2.9.1` | `MIT` | `LICENSE` | none | JS-only package in current app build. |
| `@embedpdf/engines` | `2.9.1` | `MIT` | `LICENSE` | none directly | Depends on `@embedpdf/pdfium` and all `@embedpdf/fonts-*`; exposes engine entries via `exports`. |
| `@embedpdf/models` | `2.9.1` | `MIT` | `LICENSE` | none | JS/types only. |
| `@embedpdf/pdfium` | `2.9.1` | `MIT` | `LICENSE`, `LICENSE.pdfium` | `dist/pdfium.wasm` | Best current copy source for wasm. `./pdfium.wasm` is explicitly exported. README says bundled PDFium is under Apache-2.0. |
| `@embedpdf/fonts-arabic` | `1.0.0` | `OFL-1.1` | `LICENSE` | `fonts/*.ttf` | Present in `node_modules`; not emitted to current `dist/`. |
| `@embedpdf/fonts-hebrew` | `1.0.0` | `OFL-1.1` | `LICENSE` | `fonts/*.ttf` | Present in `node_modules`; not emitted to current `dist/`. |
| `@embedpdf/fonts-jp` | `1.0.0` | `OFL-1.1` | `LICENSE` | `fonts/*.otf` | Present in `node_modules`; not emitted to current `dist/`. |
| `@embedpdf/fonts-kr` | `1.0.0` | `OFL-1.1` | `LICENSE` | `fonts/*.otf` | Present in `node_modules`; not emitted to current `dist/`. |
| `@embedpdf/fonts-latin` | `1.0.0` | `OFL-1.1` | `LICENSE` | `fonts/*.ttf` | Present in `node_modules`; not emitted to current `dist/`. |
| `@embedpdf/fonts-sc` | `1.0.0` | `OFL-1.1` | `LICENSE` | `fonts/*.otf` | Present in `node_modules`; not emitted to current `dist/`. |
| `@embedpdf/fonts-tc` | `1.0.0` | `OFL-1.1` | `LICENSE` | `fonts/*.otf` | Present in `node_modules`; not emitted to current `dist/`. |

### 4.2 Additional evidence and stability notes

- `@embedpdf/pdfium` exports `./pdfium.wasm`.
  - `node_modules/@embedpdf/pdfium/package.json:11-27`
- `@embedpdf/pdfium` package `files` contains `dist` and `README.md`; its `LICENSE` files are present in the installed package even though they are not listed in `files`.
  - `node_modules/@embedpdf/pdfium/package.json:45-48`
  - actual files:
    - `node_modules/@embedpdf/pdfium/LICENSE`
    - `node_modules/@embedpdf/pdfium/LICENSE.pdfium`
- `@embedpdf/engines` package `files` contains `dist` and `README.md`; font packages are listed as dependencies.
  - `node_modules/@embedpdf/engines/package.json:67-100`
- `@embedpdf/snippet` physically contains `dist/pdfium.wasm`, but it does not provide a dedicated exported subpath for that wasm. As a copy source contract, `@embedpdf/pdfium` is stronger.
  - `node_modules/@embedpdf/snippet/package.json:8-18`

### 4.3 About `@embedpdf/plugin-*` packages actually bundled through snippet

Observed facts:

- `@embedpdf/snippet` depends on many `@embedpdf/plugin-*` packages.
  - `node_modules/@embedpdf/snippet/package.json:12-43`
- `find node_modules/@embedpdf -maxdepth 2 -type f -name 'LICENSE*'` found 40 license files, including each plugin package license file.
- No standalone asset files from those plugin packages were observed in current `dist/`; they are bundled into JS.

This report therefore distinguishes:

- asset-bearing packages that matter immediately for file-level redistribution (`@embedpdf/pdfium`, `@embedpdf/fonts-*`)
- JS-only EmbedPDF packages that still matter for a broader third-party notice policy

## 5. Answer to Key Questions

- `pdfium.wasm` を `public` から build 時コピーに変えるべきか: Yes.
  - 根拠: `public/pdfium.wasm` は `node_modules/@embedpdf/pdfium/dist/pdfium.wasm` と同一ハッシュで、repo 内に vendor binary を固定しているだけです。build 時コピーの方が provenance と version sync が明確です。
- build 時コピーだけで概ねクリアと言えるか: No.
  - 根拠: 現状 build は `dist/pdfium.wasm` に加えて `dist/assets/pdfium-*.wasm` も出しており、コピー元を変えるだけでは重複配布は残ります。さらに `dist/` にはライセンス原文が 1 件も入っていません。
- `dist` に物理ライセンス文書を同梱すべきか: Yes.
  - 根拠: 現在の配布物には `LICENSE*` / `NOTICE*` が存在しません。最低でも再配布バイナリと密接な `@embedpdf/pdfium/LICENSE` と `@embedpdf/pdfium/LICENSE.pdfium` は `dist` に物理配置すべきです。
- Web UI から閲覧可能にするべきか: Yes.
  - 根拠: UI 表示だけでは配布物の原文同梱にならず、同梱だけでは利用者到達性が低いです。要件が「同梱し、さらに Web UI から確認できる形」である以上、両方を分けて満たす必要があります。
- `pdfium` 以外に確認が必要な third-party asset はあるか: Yes.
  - 根拠: `@embedpdf/fonts-*` package 群は OFL-1.1 ライセンス付き font ファイルを物理同梱しています。現行 `dist` では未配布ですが、将来 `fontFallback` を有効にして font を配るなら、そのライセンスも同梱対象です。
- repo 自体に `LICENSE` を置くべきか: Yes.
  - 根拠: repo ルートに `LICENSE` が存在せず、自作コードの利用条件が未定義です。これは第三者ライセンス対応とは別の論点ですが、公開・配布判断には影響します。

## 6. Recommended Minimum-Compliant Plan

### 6.1 One recommended minimum plan

1. `public/pdfium.wasm` を repo 追跡対象から外し、build 時に `node_modules/@embedpdf/pdfium/dist/pdfium.wasm` を `dist/pdfium.wasm` へコピーする。
2. 同じ build 時に、少なくとも以下の原文を `dist/licenses/...` へコピーする。
3. UI に `About / Licenses` 導線を 1 つ作り、`dist/licenses/...` の原文ファイルへリンクする。
4. font を実際に配るまでは font 原文は必須コピー対象にしないが、将来配布時は同時コピーに切り替える。
5. 別論点として repo ルートに自作コード用 `LICENSE` を置く。

### 6.2 Copy sources and destinations

Recommended immediate copy set:

- `node_modules/@embedpdf/pdfium/dist/pdfium.wasm`
  - copy to `dist/pdfium.wasm`
- `node_modules/@embedpdf/pdfium/LICENSE`
  - copy to `dist/licenses/embedpdf/pdfium/LICENSE`
- `node_modules/@embedpdf/pdfium/LICENSE.pdfium`
  - copy to `dist/licenses/embedpdf/pdfium/LICENSE.pdfium`
- `node_modules/@embedpdf/react-pdf-viewer/LICENSE`
  - copy to `dist/licenses/embedpdf/react-pdf-viewer/LICENSE`
- `node_modules/@embedpdf/snippet/LICENSE`
  - copy to `dist/licenses/embedpdf/snippet/LICENSE`
- `node_modules/@embedpdf/engines/LICENSE`
  - copy to `dist/licenses/embedpdf/engines/LICENSE`

Conditional copy set only if fonts are actually redistributed later:

- `node_modules/@embedpdf/fonts-*/LICENSE`
  - copy to matching `dist/licenses/embedpdf/fonts-*/LICENSE`
- actual copied font files
  - place next to runtime-resolved font URL path

### 6.3 UI exposure method

Minimum UI requirement that satisfies the stated goal:

- Add one `About / Licenses` entry in the app UI.
- That screen can be minimal: a list of local links.
- Each link should target a real file under `dist/licenses/...`.
- Optional enhancement: fetch and render selected text inline.

The important distinction is:

- physical inclusion in `dist`: required
- UI navigability to that included text: also required

### 6.4 What to place in README / repo root / dist

- repo root:
  - project `LICENSE` for this repo’s own code
- `README.md`:
  - short note describing where bundled third-party licenses are emitted in releases
- `dist/`:
  - runtime wasm if continuing current explicit `wasmUrl` contract
  - `dist/licenses/...` raw third-party license texts

### 6.5 Why this is the minimum that still looks sufficient

- It removes the checked-in vendor binary from source control.
- It ties runtime artifact provenance to the installed package version actually used by the build.
- It keeps original license texts inside the deployed artifact instead of pointing only to the internet.
- It gives end users a deterministic path from UI to the exact bundled text.
- It does not overreach into font handling until fonts are actually shipped.

### 6.6 What this plan still does not solve by itself

- If the app continues to pass `wasmUrl: ${import.meta.env.BASE_URL}pdfium.wasm`, the package-bundled `dist/assets/pdfium-*.wasm` is still emitted by Vite. Build-time copy changes provenance handling, but not the duplicate-wasm problem.
- If you want a single runtime wasm file, implementation must also choose one of these:
  - accept current duplication as harmless
  - remove the explicit root-path wasm and use the package-bundled asset as the only runtime source
  - otherwise alter bundling/runtime wiring so only one path survives

## 7. Open Questions / Human Decisions

- Scope decision: Is the compliance target limited to static/binary assets and the main EmbedPDF packages, or does release policy require a full third-party notice set for every bundled JS dependency in `dist/assets/*.js`?
- Packaging decision: Is duplicate pdfium wasm in `dist` acceptable, or should implementation explicitly converge on one runtime wasm path?
- UI decision: Is a simple link list enough for `About / Licenses`, or must the UI render full text inline?
- Repo license decision: What license should this repository’s own source code use?
- Release decision: Should `dist/licenses/...` preserve upstream filenames verbatim, or should they also be aggregated into a generated `THIRD_PARTY_NOTICES` file?

If asking upstream/vendor before implementation, these are the concrete questions to send:

- Are `LICENSE` and `LICENSE.pdfium` the intended files to redistribute with `@embedpdf/pdfium` binary releases?
- Is there any additional `NOTICE` file or attribution expected for the bundled PDFium wasm beyond `LICENSE.pdfium`?
- Is `@embedpdf/pdfium` the recommended canonical source for redistributing `pdfium.wasm`, rather than `@embedpdf/snippet/dist/pdfium.wasm`?
- Are the font package `LICENSE` filenames and font file locations intended to remain stable for automated copying?

## 8. Optional Additional Findings

- There is no Vite config file in the repo, and built HTML currently references root-absolute asset paths such as `/assets/index-...js`.
  - `dist/index.html`
  - `index.html:10`
  - `src/App.jsx:20`
  - If this site is deployed to a GitHub Pages project subpath rather than domain root, base path handling may need separate review. This is not a license issue, but it affects deploy correctness.
- The app sets `worker: false` in `src/App.jsx`, but build output still includes a `worker-engine-*.js` chunk. That is a distribution-size issue, not a license blocker.
- The built bundle still contains a CDN default wasm URL string from EmbedPDF internals, but the app currently overrides it with `config.wasmUrl`, so current runtime intent is local wasm, not CDN.

## 9. Command Log

Commands run and the key observations:

- `npm ci`
  - Installed 202 packages successfully.
- `npm run build`
  - Produced `dist/` successfully.
  - Reported both `dist/pdfium.wasm` and `dist/assets/pdfium-6UaCOAE8.wasm`.
- `find dist -type f | sort`
  - Confirmed actual deployment file list.
- `find dist -type f | rg -i '\.(wasm|woff2?|ttf|otf|eot|license|licenses|notice|txt)$'`
  - Found only the two wasm files; no font/license/notice/text assets.
- `sha256sum public/pdfium.wasm node_modules/@embedpdf/pdfium/dist/pdfium.wasm node_modules/@embedpdf/snippet/dist/pdfium.wasm dist/pdfium.wasm dist/assets/pdfium-*.wasm`
  - All five files matched exactly.
- `npm ls @embedpdf/...`
  - Confirmed actual installed versions and dependency graph.
- `find node_modules/@embedpdf -maxdepth 3 \( -iname 'LICENSE*' -o -iname 'NOTICE*' -o -iname 'COPYING*' -o -iname '*.wasm' -o -iname '*.ttf' -o -iname '*.otf' -o -iname '*.woff' -o -iname '*.woff2' \) | sort`
  - Confirmed actual license files and redistributable asset files in packages.
- `test -f LICENSE && echo LICENSE_PRESENT || echo LICENSE_ABSENT`
  - Result: `LICENSE_ABSENT`

## 10. Next-Phase Implementation Preview

No implementation was done in this investigation. If the next phase proceeds, the first candidate changes are:

- add a build-step copy mechanism that sources `node_modules/@embedpdf/pdfium/dist/pdfium.wasm` and selected license files into `dist/`
- remove repo-tracked `public/pdfium.wasm` once build-time source-of-truth is established
- add a minimal `About / Licenses` UI entry that links to `dist/licenses/...`
- decide whether `src/App.jsx` should keep explicit `wasmUrl` or switch to the package-bundled wasm path to eliminate duplicate wasm
- add repo root `LICENSE` after human decision on project license
