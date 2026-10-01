import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Production-only Content-Security-Policy as a <meta> tag, for hosts that
 * can't set response headers (GitHub Pages). Dev is skipped because Vite's
 * HMR injects inline scripts. Hosts that support headers should send it as
 * a header instead (frame-ancestors only works there).
 */
function cspMeta(env) {
  const supabase = env.VITE_SUPABASE_URL ? new URL(env.VITE_SUPABASE_URL) : null;
  const connect = ["'self'", supabase && supabase.origin, supabase && `wss://${supabase.host}`].filter(Boolean).join(' ');
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", // inline style attributes
    'font-src https://fonts.gstatic.com',
    `connect-src ${connect}`,
    "img-src 'self' data:",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
  return {
    name: 'csp-meta',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' }],
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    // "/" locally; "/<repo>/" on GitHub Pages project sites (set by the deploy workflow).
    base: env.VITE_BASE_PATH || '/',
    plugins: [react(), cspMeta(env)],
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
