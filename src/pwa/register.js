/* Installable-app plumbing: service worker registration and the browser's install prompt. */

let deferred = null; // the browser's beforeinstallprompt event, when it offers one
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

/** True when running as the installed app (home screen / dock). */
export const isStandalone = () =>
  typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true);

/** iPhone / iPad Safari: no install prompt — "Share → Add to Home Screen" instead. */
export const isIOS = () =>
  typeof navigator !== "undefined" && (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

/** What installing looks like here: "prompt" (we can show the browser dialog), "ios" (manual), "installed" or "none". */
export function installState() {
  if (isStandalone()) return "installed";
  if (deferred) return "prompt";
  if (isIOS()) return "ios";
  return "none";
}

export function subscribeInstall(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** Shows the browser's install dialog. Resolves true when the user accepts. */
export async function promptInstall() {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  notify();
  e.prompt();
  const { outcome } = await e.userChoice;
  return outcome === "accepted";
}

/** Call once at startup. The service worker only runs in production builds. */
export function setupPwa() {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; notify(); });
  window.addEventListener("appinstalled", () => { deferred = null; notify(); });
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register(import.meta.env.BASE_URL + "sw.js", { scope: import.meta.env.BASE_URL }).catch(() => {});
    });
  }
}
