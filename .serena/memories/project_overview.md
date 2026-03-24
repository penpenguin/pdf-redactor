# pdf-redactor
- Purpose: static PDF redaction web app that runs entirely in the browser and can be published to GitHub Pages.
- Stack: React 19, Vite 8, Vitest + jsdom, EmbedPDF React PDF Viewer + PDFium WASM.
- Structure: `src/App.jsx` is the main UI/controller, `src/main.jsx` boots the app, `src/redaction-groups.js` holds pending redaction grouping logic, `src/download.js` handles PDF download, `index.html` is the Vite entry.
- Old Python/FastAPI backend has been removed in favor of a static frontend-only architecture.
- README documents local dev, build, and deployment.