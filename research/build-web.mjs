// Build web assets: data.js (window.DSP_DATA) and engine.js (no-module engine bundle)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
mkdirSync(ROOT + 'web/', { recursive: true });

// 1. data.js
const dataset = readFileSync(ROOT + 'data/dsp-data.json', 'utf8');
writeFileSync(ROOT + 'web/data.js', `// 由 research/build-web.mjs 自动生成，请勿手改\nwindow.DSP_DATA = ${dataset};\n`);
console.log('web/data.js written');

// 2. engine.js — strip ESM exports and wrap in an IIFE so no top-level
//    declarations (e.g. `function fmt`) leak into the shared global scope
//    of classic scripts and collide with app.js bindings.
let src = readFileSync(ROOT + 'src/engine.mjs', 'utf8');
src = src.replace(/^export function createEngine/m, 'function createEngine');
src = src.replace(/^export \{ fmt \};\s*$/m, '');
writeFileSync(ROOT + 'web/engine.js', `// 由 research/build-web.mjs 自动生成，请勿手改\n(function () {\n${src}\nwindow.createEngine = createEngine;\n})();\n`);
console.log('web/engine.js written');
