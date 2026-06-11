// ESLint — gerbang correctness FE (audit 2026-06-10 Task 2.9).
//
// Filosofi kalibrasi: rule set KECIL yang baseline-nya NOL error hari ini,
// supaya `npm run lint` bisa langsung jadi gate CI yang dipercaya — bukan
// daftar 500 warning yang diabaikan semua orang. Rule gaya/format sengaja
// tidak dipakai (tidak ada Prettier; gaya mengikuti kode sekitar, pakem
// proyek). Perketat bertahap saat folder dimigrasi ke TS strict.
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
    {
        ignores: [
            'vendor/**',
            'node_modules/**',
            'public/**',
            'bootstrap/**',
            'storage/**',
        ],
    },
    {
        files: ['resources/js/**/*.{ts,tsx}', 'scripts/**/*.mjs', '*.config.js', 'vite.config.ts'],
        extends: [js.configs.recommended, ...tseslint.configs.recommended],
        plugins: { 'react-hooks': reactHooks },
        linterOptions: {
            // Codebase punya komentar eslint-disable exhaustive-deps dari masa
            // pra-ESLint — dokumentasi intent yang berguna saat rule itu nanti
            // dinyalakan. Jangan flag sebagai unused selagi rule-nya off.
            reportUnusedDisableDirectives: 'off',
        },
        rules: {
            // Correctness hooks — kelas bug React paling mahal.
            'react-hooks/rules-of-hooks': 'error',
            // exhaustive-deps: off — codebase punya pola deps-disengaja yang
            // terdokumentasi; nyalakan per-folder saat migrasi TS strict.
            'react-hooks/exhaustive-deps': 'off',

            // Kalibrasi terhadap kondisi codebase (lihat header):
            '@typescript-eslint/no-explicit-any': 'error', // codebase memang 0 `any`
            '@typescript-eslint/no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrors: 'none',
            }],
            // Idiom sah ber-frekuensi-tinggi: `set.has(x) ? set.delete(x) : set.add(x)`
            // dan `cond && fn()` sebagai statement.
            '@typescript-eslint/no-unused-expressions': ['error', {
                allowShortCircuit: true,
                allowTernary: true,
            }],
            // tsc (typecheck di CI) sudah menangkap kelas undefined-name utk TS.
            'no-undef': 'off',
            // Pola sah di codebase (empty catch utk fire-and-forget yang disengaja
            // selalu berkomentar; biarkan reviewer yang menilai, bukan linter).
            'no-empty': ['error', { allowEmptyCatch: true }],
        },
    },
)
