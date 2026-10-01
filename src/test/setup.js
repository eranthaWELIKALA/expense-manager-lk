/* Node ≥22 ships an experimental global `localStorage` that shadows jsdom's
   and is broken without --localstorage-file. Install a spec-shaped in-memory
   Storage so tests behave the same on every Node version. */
class MemoryStorage {
  #m = new Map();
  get length() { return this.#m.size; }
  key(i) { return [...this.#m.keys()][i] ?? null; }
  getItem(k) { return this.#m.has(k) ? this.#m.get(k) : null; }
  setItem(k, v) { this.#m.set(String(k), String(v)); }
  removeItem(k) { this.#m.delete(k); }
  clear() { this.#m.clear(); }
}
for (const name of ["localStorage", "sessionStorage"]) {
  Object.defineProperty(globalThis, name, { value: new MemoryStorage(), configurable: true, writable: true });
}
