import { useEffect } from "react";

/* Shared across all callers so stacked dialogs (e.g. a confirm on top of an
   edit modal) only unlock when the last one closes. */
let locks = 0;
let saved = null;

function lock() {
  if (locks++ > 0) return;
  const { body, documentElement } = document;
  const scrollbar = window.innerWidth - documentElement.clientWidth;
  saved = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
  body.style.overflow = "hidden";
  // Keep layout from shifting when the scrollbar disappears.
  if (scrollbar > 0) body.style.paddingRight = `${(parseFloat(getComputedStyle(body).paddingRight) || 0) + scrollbar}px`;
}

function unlock() {
  if (--locks > 0 || !saved) return;
  document.body.style.overflow = saved.overflow;
  document.body.style.paddingRight = saved.paddingRight;
  saved = null;
}

/** Prevent the page behind an overlay from scrolling while `active`. */
export function useScrollLock(active = true) {
  useEffect(() => {
    if (!active) return undefined;
    lock();
    return unlock;
  }, [active]);
}
