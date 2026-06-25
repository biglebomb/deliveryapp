# Delivery App — agent notes

Fresh-milk delivery management PWA. Vue 3 (`<script setup>`) + Vuetify 3, Supabase
backend, multi-branch. Currency IDR, timezone Asia/Jakarta.

## UI conventions

- **Always prefer a Vuetify component over a native HTML element or a third-party UI
  package.** Before reaching for a native `<input>`, `<select>`, `<textarea>`,
  `<button>`, or a browser-native control (e.g. `<v-text-field type="date">` which
  opens the OS date picker), use the Vuetify equivalent: `v-date-picker` (in a
  `v-menu`), `v-select` / `v-autocomplete`, `v-textarea`, `v-btn`, `v-data-table`,
  `v-dialog`, etc. Only fall back to a native element or add a dependency when
  Vuetify genuinely has no equivalent — and say so in the PR/commit.
- Theme through Vuetify tokens: `rgb(var(--v-theme-*))`, `--v-layout-*`,
  `--v-border-*`. Don't hardcode colors.
- Money via `formatCurrency`; dates/times via the helpers in `src/lib/format.ts`.
