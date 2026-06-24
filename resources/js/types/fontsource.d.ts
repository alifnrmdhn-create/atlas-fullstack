// @fontsource paket hanya mengekspor CSS (side-effect import), tanpa deklarasi
// tipe. Deklarasi ambient agar `import '@fontsource-variable/...'` di app.tsx
// lolos typecheck (TS2882). Lihat resources/js/app.tsx.
declare module '@fontsource-variable/public-sans'
declare module '@fontsource-variable/geist-mono'
