# Style and conventions
- Project communication is primarily in Japanese.
- Follow t-wada style TDD: Red -> Green -> Refactor in the smallest steps.
- Prefer fast unit/component tests with Vitest + jsdom.
- Keep production code minimal and extract small helpers for stateful logic.
- Use apply_patch for manual code edits.
- Current frontend keeps a custom shell/sidebar UI around EmbedPDF's viewer and hides most built-in UI categories.
- Relative asset/base paths are important because the app targets GitHub Pages.