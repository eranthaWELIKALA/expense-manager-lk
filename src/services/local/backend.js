/* ============================================================
   In-browser demo backend.

   NOT A SECURITY BOUNDARY. Everything lives in this browser's
   localStorage, so anyone with access to the device can read it.
   It exists so the app runs with zero setup and so the sharing
   flow can be tried end-to-end: sign up two users in two tabs
   (sessions are per-tab) and invite one from the other.

   Permission checks deliberately mirror the SQL in
   supabase/migrations so behaviour matches production.
   ============================================================ */

import { AppError, ErrorCode } from "../errors";

const DB_KEY = "mmp:local-db:v1";
const SESSION_KEY = "mmp:local-session:v1";
const INVITE_TTL_MS = 14 * 24 * 3600 * 1000;

const fail = (code, message) => { throw new AppError(code, message); };
const forbidden = () => fail(ErrorCode.FORBIDDEN, "You don't have permission to do that.");
const notFound = () => fail(ErrorCode.NOT_FOUND, "That item doesn't exist or isn't shared with you.");
const now = () => new Date().toISOString();
const newId = () => crypto.randomUUID();
const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

const emptyDb = () => ({ users: [], profiles: [], members: [], invitations: [], audit: [], seq: 0 });

function readDb() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    return raw ? { ...emptyDb(), ...JSON.parse(raw) } : emptyDb();
  } catch {
    return emptyDb();
  }
}

function writeDb(db) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    fail(ErrorCode.UNKNOWN, "Browser storage is full or disabled, so changes can't be saved.");
  }
}

/** Read-modify-write. The callback may mutate `db` and return a value. */
function tx(fn) {
  const db = readDb();
  const out = fn(db);
  writeDb(db);
  return clone(out);
}

const view = (fn) => clone(fn(readDb()));

/* ---------- passwords: PBKDF2 via WebCrypto (never stored in plain text) ---------- */
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
async function hashPassword(password, saltHex) {
  const salt = saltHex ? Uint8Array.from(saltHex.match(/../g).map((h) => parseInt(h, 16))) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 210000, hash: "SHA-256" }, key, 256);
  return { salt: toHex(salt), hash: toHex(bits) };
}
const safeEqual = (a, b) => a.length === b.length && [...a].reduce((acc, ch, i) => acc | (ch.charCodeAt(0) ^ b.charCodeAt(i)), 0) === 0;

/* ---------- session (per tab) ---------- */
const getSessionUserId = () => { try { return sessionStorage.getItem(SESSION_KEY); } catch { return null; } };
const setSessionUserId = (id) => { try { id ? sessionStorage.setItem(SESSION_KEY, id) : sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ } };

const publicUser = (u) => (u ? { id: u.id, email: u.email, emailConfirmed: true } : null);
const accountOf = (u) => ({ id: u.id, email: u.email, displayName: u.displayName, defaultCurrency: u.defaultCurrency });

export function createLocalBackend() {
  const authListeners = new Set();
  const emitAuth = (event) => {
    const u = view((db) => db.users.find((x) => x.id === getSessionUserId()));
    authListeners.forEach((cb) => cb(publicUser(u), event));
  };

  const me = (db) => {
    const id = getSessionUserId();
    const u = id && db.users.find((x) => x.id === id);
    if (!u) fail(ErrorCode.AUTH, "Please sign in again.");
    return u;
  };
  const roleIn = (db, profileId, userId) => db.members.find((m) => m.profileId === profileId && m.userId === userId)?.role || null;
  const audit = (db, profileId, actorId, action, details = {}) => {
    db.seq += 1;
    db.audit.push({ id: String(db.seq), profileId, actorId, action, details, createdAt: now() });
  };
  const meta = (db, p, role) => ({ id: p.id, name: p.name, currency: p.currency, ownerId: p.ownerId, role, updatedAt: p.updatedAt });
  const checkName = (name) => {
    const n = String(name || "").trim();
    if (n.length < 1 || n.length > 80) fail(ErrorCode.INVALID, "Name must be 1–80 characters.");
    return n;
  };
  const checkCurrency = (c) => {
    if (!/^[A-Z]{3}$/.test(c)) fail(ErrorCode.INVALID, "Currency must be a 3-letter code like LKR.");
    return c;
  };

  return {
    kind: "local",

    auth: {
      async getUser() {
        return view((db) => publicUser(db.users.find((x) => x.id === getSessionUserId())));
      },
      onChange(cb) {
        authListeners.add(cb);
        return () => authListeners.delete(cb);
      },
      async signUp({ email, password, displayName }) {
        const e = String(email).trim().toLowerCase();
        if (view((db) => db.users.some((u) => u.email === e))) fail(ErrorCode.AUTH, "An account with this email already exists.");
        const { salt, hash } = await hashPassword(password);
        const user = tx((db) => {
          const u = { id: newId(), email: e, displayName: String(displayName || "").trim().slice(0, 80), defaultCurrency: "LKR", salt, hash, createdAt: now() };
          db.users.push(u);
          return u;
        });
        setSessionUserId(user.id);
        emitAuth("SIGNED_IN");
        return { user: publicUser(user), needsConfirmation: false };
      },
      async signIn({ email, password }) {
        const e = String(email).trim().toLowerCase();
        const u = view((db) => db.users.find((x) => x.email === e));
        // Hash even when the user is missing so timing doesn't reveal which emails exist.
        const { hash } = await hashPassword(password, u?.salt || "00".repeat(16));
        if (!u || !safeEqual(hash, u.hash)) fail(ErrorCode.AUTH, "Invalid email or password.");
        setSessionUserId(u.id);
        emitAuth("SIGNED_IN");
        return publicUser(u);
      },
      async signOut() {
        setSessionUserId(null);
        emitAuth("SIGNED_OUT");
      },
      async requestPasswordReset() {
        /* No email in demo mode; the UI explains this. */
      },
      async updatePassword(password) {
        const { salt, hash } = await hashPassword(password);
        tx((db) => { const u = me(db); u.salt = salt; u.hash = hash; });
        emitAuth("USER_UPDATED");
      },
    },

    account: {
      async get() {
        return view((db) => accountOf(me(db)));
      },
      async update({ displayName, defaultCurrency }) {
        return tx((db) => {
          const u = me(db);
          if (displayName !== undefined) u.displayName = String(displayName).trim().slice(0, 80);
          if (defaultCurrency !== undefined) u.defaultCurrency = checkCurrency(defaultCurrency);
          return accountOf(u);
        });
      },
    },

    profiles: {
      async list() {
        return view((db) => {
          const u = me(db);
          return db.members.filter((m) => m.userId === u.id)
            .map((m) => { const p = db.profiles.find((x) => x.id === m.profileId); return p && meta(db, p, m.role); })
            .filter(Boolean)
            .sort((a, b) => a.name.localeCompare(b.name));
        });
      },
      async get(id) {
        return view((db) => {
          const u = me(db);
          const p = db.profiles.find((x) => x.id === id);
          const role = roleIn(db, id, u.id);
          if (!p || !role) notFound();
          return { ...meta(db, p, role), data: p.data, version: p.version };
        });
      },
      async create({ name, currency, data }) {
        return tx((db) => {
          const u = me(db);
          if (db.profiles.filter((p) => p.ownerId === u.id).length >= 50) fail(ErrorCode.INVALID, "You've reached the maximum number of profiles.");
          const p = { id: newId(), ownerId: u.id, name: checkName(name), currency: checkCurrency(currency), data, version: 1, createdAt: now(), updatedAt: now() };
          db.profiles.push(p);
          db.members.push({ profileId: p.id, userId: u.id, role: "owner", createdAt: now() });
          audit(db, p.id, u.id, "profile.created", { name: p.name });
          return p.id;
        });
      },
      async updateMeta(id, { name, currency }) {
        tx((db) => {
          const u = me(db);
          const p = db.profiles.find((x) => x.id === id);
          if (!p || roleIn(db, id, u.id) !== "owner") forbidden();
          if (name !== undefined) p.name = checkName(name);
          if (currency !== undefined) p.currency = checkCurrency(currency);
          p.updatedAt = now();
        });
      },
      async saveData(id, data, expectedVersion) {
        return tx((db) => {
          const u = me(db);
          const p = db.profiles.find((x) => x.id === id);
          const role = roleIn(db, id, u.id);
          if (!p || !(role === "owner" || role === "editor")) forbidden();
          if (p.version !== expectedVersion) fail(ErrorCode.CONFLICT, "Someone else changed this profile just now.");
          p.data = data; p.version += 1; p.updatedAt = now(); p.updatedBy = u.id;
          return p.version;
        });
      },
      async remove(id) {
        tx((db) => {
          const u = me(db);
          const p = db.profiles.find((x) => x.id === id);
          if (!p || roleIn(db, id, u.id) !== "owner") forbidden();
          audit(db, id, u.id, "profile.deleted", { name: p.name });
          db.profiles = db.profiles.filter((x) => x.id !== id);
          db.members = db.members.filter((m) => m.profileId !== id);
          db.invitations = db.invitations.filter((i) => i.profileId !== id);
        });
      },
      async leave(id) {
        tx((db) => {
          const u = me(db);
          const role = roleIn(db, id, u.id);
          if (!role || role === "owner") forbidden();
          db.members = db.members.filter((m) => !(m.profileId === id && m.userId === u.id));
          audit(db, id, u.id, "member.left", { user_id: u.id, role });
        });
      },
      subscribe(id, cb) {
        // Other tabs write to localStorage; the `storage` event tells us.
        const onStorage = (e) => {
          if (e.key !== DB_KEY) return;
          const p = readDb().profiles.find((x) => x.id === id);
          if (p) cb({ version: p.version, data: p.data, name: p.name, currency: p.currency });
        };
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
      },
    },

    sharing: {
      async members(profileId) {
        return view((db) => {
          const u = me(db);
          if (!roleIn(db, profileId, u.id)) notFound();
          return db.members.filter((m) => m.profileId === profileId).map((m) => {
            const a = db.users.find((x) => x.id === m.userId);
            return { userId: m.userId, role: m.role, joinedAt: m.createdAt, email: a?.email || "", displayName: a?.displayName || "" };
          });
        });
      },
      async setRole(profileId, userId, role) {
        tx((db) => {
          const u = me(db);
          const m = db.members.find((x) => x.profileId === profileId && x.userId === userId);
          if (roleIn(db, profileId, u.id) !== "owner" || !m || m.role === "owner" || userId === u.id) forbidden();
          if (role !== "editor" && role !== "viewer") fail(ErrorCode.INVALID, "Choose editor or viewer.");
          audit(db, profileId, u.id, "member.role_changed", { user_id: userId, from: m.role, to: role });
          m.role = role;
        });
      },
      async removeMember(profileId, userId) {
        tx((db) => {
          const u = me(db);
          const m = db.members.find((x) => x.profileId === profileId && x.userId === userId);
          if (roleIn(db, profileId, u.id) !== "owner" || !m || userId === u.id) forbidden();
          db.members = db.members.filter((x) => x !== m);
          audit(db, profileId, u.id, "member.removed", { user_id: userId, role: m.role });
        });
      },
      async invitations(profileId) {
        return view((db) => {
          const u = me(db);
          if (roleIn(db, profileId, u.id) !== "owner") forbidden();
          return db.invitations.filter((i) => i.profileId === profileId && i.status === "pending")
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map(({ id, profileId: pid, email, role, expiresAt, createdAt }) => ({ id, profileId: pid, email, role, expiresAt, createdAt }));
        });
      },
      async invite(profileId, { email, role }) {
        return tx((db) => {
          const u = me(db);
          const e = String(email).trim().toLowerCase();
          if (roleIn(db, profileId, u.id) !== "owner") forbidden();
          if (role !== "editor" && role !== "viewer") fail(ErrorCode.INVALID, "Choose editor or viewer.");
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) fail(ErrorCode.INVALID, "Enter a valid email address.");
          if (e === u.email) fail(ErrorCode.INVALID, "You can't invite yourself.");
          const memberEmails = db.members.filter((m) => m.profileId === profileId).map((m) => db.users.find((x) => x.id === m.userId)?.email);
          if (memberEmails.includes(e)) fail(ErrorCode.INVALID, "That person already has access.");
          let inv = db.invitations.find((i) => i.profileId === profileId && i.email === e && i.status === "pending");
          if (inv) {
            Object.assign(inv, { role, invitedBy: u.id, createdAt: now(), expiresAt: new Date(Date.now() + INVITE_TTL_MS).toISOString() });
          } else {
            if (db.invitations.filter((i) => i.profileId === profileId && i.status === "pending").length >= 25) fail(ErrorCode.INVALID, "Too many pending invitations. Revoke some first.");
            inv = { id: newId(), profileId, email: e, role, status: "pending", invitedBy: u.id, createdAt: now(), expiresAt: new Date(Date.now() + INVITE_TTL_MS).toISOString() };
            db.invitations.push(inv);
          }
          audit(db, profileId, u.id, "invitation.created", { invitation_id: inv.id, email: e, role });
          return { id: inv.id, profileId, email: e, role, expiresAt: inv.expiresAt, createdAt: inv.createdAt };
        });
      },
      async revoke(invitationId) {
        tx((db) => {
          const u = me(db);
          const inv = db.invitations.find((i) => i.id === invitationId);
          if (!inv || roleIn(db, inv.profileId, u.id) !== "owner") forbidden();
          if (inv.status === "pending") Object.assign(inv, { status: "revoked", respondedAt: now(), respondedBy: u.id });
          audit(db, inv.profileId, u.id, "invitation.revoked", { invitation_id: inv.id, email: inv.email });
        });
      },
      async incoming() {
        return view((db) => {
          const u = me(db);
          const t = now();
          return db.invitations.filter((i) => i.email === u.email && i.status === "pending" && i.expiresAt > t).map((i) => {
            const p = db.profiles.find((x) => x.id === i.profileId);
            const by = db.users.find((x) => x.id === i.invitedBy);
            return p && { id: i.id, profileId: i.profileId, profileName: p.name, role: i.role, invitedByName: by?.displayName || "", invitedByEmail: by?.email || "", expiresAt: i.expiresAt };
          }).filter(Boolean);
        });
      },
      async respond(invitationId, accept) {
        return tx((db) => {
          const u = me(db);
          const inv = db.invitations.find((i) => i.id === invitationId);
          if (!inv || inv.email !== u.email) notFound();
          if (inv.status !== "pending" || inv.expiresAt <= now()) fail(ErrorCode.INVALID, "This invitation has expired or was already used.");
          Object.assign(inv, { status: accept ? "accepted" : "declined", respondedAt: now(), respondedBy: u.id });
          if (accept && !roleIn(db, inv.profileId, u.id)) db.members.push({ profileId: inv.profileId, userId: u.id, role: inv.role, createdAt: now() });
          audit(db, inv.profileId, u.id, accept ? "invitation.accepted" : "invitation.declined", { invitation_id: inv.id, role: inv.role });
          return inv.profileId;
        });
      },
      async activity(profileId) {
        return view((db) => {
          const u = me(db);
          if (roleIn(db, profileId, u.id) !== "owner") forbidden();
          return db.audit.filter((a) => a.profileId === profileId).slice(-50).reverse().map((a) => {
            const actor = db.users.find((x) => x.id === a.actorId);
            return { id: a.id, action: a.action, details: a.details, actorName: actor ? actor.displayName || actor.email : "Former member", createdAt: a.createdAt };
          });
        });
      },
    },
  };
}
