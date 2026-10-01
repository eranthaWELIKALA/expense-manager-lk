/* Runtime configuration from Vite env vars (see .env.example).
   Only VITE_* values reach the browser — never put secrets here. */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const env = {
  supabaseUrl,
  supabaseAnonKey,
  /** "supabase" when configured, otherwise the in-browser demo backend. */
  backend: supabaseUrl && supabaseAnonKey ? "supabase" : "local",
  /** Public app URL (origin + base path) used in invitation and auth-redirect links. */
  appUrl: (import.meta.env.VITE_APP_URL || window.location.origin + import.meta.env.BASE_URL).replace(/\/+$/, ""),
  /** Router basename, e.g. "/expense-manager-lk" on GitHub Pages, "" at a domain root. */
  basePath: import.meta.env.BASE_URL.replace(/\/+$/, ""),
  isProd: import.meta.env.PROD,
};
