import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Emits sw.js (from src/pwa/sw.js) with this build's files listed for
 * pre-caching, so the installed app opens offline. Build only.
 */
function serviceWorker() {
  return {
    name: 'service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map') && f !== 'index.html').sort();
      const build = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 12);
      const source = readFileSync(new URL('./src/pwa/sw.js', import.meta.url), 'utf8')
        .replace('"__BUILD__"', JSON.stringify(build))
        .replace('["__PRECACHE__"]', JSON.stringify([...files, 'manifest.webmanifest', 'icons/icon-192.png']));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

/**
 * Production-only Content-Security-Policy as a <meta> tag, for hosts that
 * can't set response headers (GitHub Pages). Dev is skipped because Vite's
 * HMR injects inline scripts. Hosts that support headers should send it as
 * a header instead (frame-ancestors only works there). Inline scripts in
 * index.html (the pre-paint theme script) are allowed by their hash.
 */
function cspMeta(env) {
  const supabase = env.VITE_SUPABASE_URL ? new URL(env.VITE_SUPABASE_URL) : null;
  const connect = ["'self'", supabase && supabase.origin, supabase && `wss://${supabase.host}`].filter(Boolean).join(' ');
  const policy = (inlineScripts) => [
    "default-src 'self'",
    ["script-src 'self'", ...inlineScripts.map((s) => `'sha256-${createHash('sha256').update(s).digest('base64')}'`)].join(' '),
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", // inline style attributes
    'font-src https://fonts.gstatic.com',
    `connect-src ${connect}`,
    "img-src 'self' data:",
    "manifest-src 'self'",
    "worker-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
  return {
    name: 'csp-meta',
    apply: 'build',
    transformIndexHtml(html) {
      const inline = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
      return [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy(inline) }, injectTo: 'head-prepend' }];
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    // "/" locally; "/<repo>/" on GitHub Pages project sites (set by the deploy workflow).
    base: env.VITE_BASE_PATH || '/',
    plugins: [react(), cspMeta(env), serviceWorker()],
    server: {
      host: '0.0.0.0',
      port: 3000,
    },
    test: {
      setupFiles: ['./src/test/setup.js'],
      // Tests always use the in-browser backend, never a real project from .env.
      env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', VITE_APP_URL: '' },
    },
  };
});
