import { createClient } from "@supabase/supabase-js";
import { env } from "../../config/env";
import { AppError, ErrorCode } from "../errors";

/* Maps Postgres / PostgREST / GoTrue errors to AppErrors with safe messages. */
const KNOWN = {
  version_conflict: [ErrorCode.CONFLICT, "Someone else changed this profile just now."],
  forbidden: [ErrorCode.FORBIDDEN, "You don't have permission to do that."],
  not_found: [ErrorCode.NOT_FOUND, "That item doesn't exist or isn't shared with you."],
  not_authenticated: [ErrorCode.AUTH, "Please sign in again."],
  already_member: [ErrorCode.INVALID, "That person already has access."],
  cannot_invite_self: [ErrorCode.INVALID, "You can't invite yourself."],
  invalid_role: [ErrorCode.INVALID, "Choose editor or viewer."],
  invite_limit: [ErrorCode.INVALID, "Too many pending invitations. Revoke some first."],
  profile_limit: [ErrorCode.INVALID, "You've reached the maximum number of profiles."],
  invitation_expired: [ErrorCode.INVALID, "This invitation has expired or was already used."],
  email_not_confirmed: [ErrorCode.AUTH, "Confirm your email address before accepting invitations."],
};

function toAppError(error) {
  const msg = String(error?.message || "");
  const hit = Object.keys(KNOWN).find((k) => msg.includes(k));
  if (hit) return new AppError(KNOWN[hit][0], KNOWN[hit][1], error);
  if (error?.code === "PGRST116") return new AppError(ErrorCode.NOT_FOUND, KNOWN.not_found[1], error);
  if (error?.code === "42501") return new AppError(ErrorCode.FORBIDDEN, KNOWN.forbidden[1], error);
  if (error?.name === "AuthApiError" || error?.__isAuthError) return new AppError(ErrorCode.AUTH, msg || "Authentication failed.", error);
  return new AppError(ErrorCode.UNKNOWN, "Something went wrong. Please try again.", error);
}

const unwrap = ({ data, error }) => {
  if (error) throw toAppError(error);
  return data;
};

const mapUser = (u) => (u ? { id: u.id, email: u.email, emailConfirmed: !!u.email_confirmed_at } : null);
const mapAccount = (r) => ({ id: r.id, email: r.email, displayName: r.display_name, defaultCurrency: r.default_currency });
const mapMeta = (p, role) => ({ id: p.id, name: p.name, currency: p.currency, ownerId: p.owner_id, role, updatedAt: p.updated_at });
const nameOf = (a) => (a ? a.display_name || a.email : "Former member");

export function createSupabaseBackend() {
  if (env.backend !== "supabase") return null;

  const sb = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
  });

  const uid = async () => {
    const { data } = await sb.auth.getSession();
    const id = data.session?.user?.id;
    if (!id) throw new AppError(ErrorCode.AUTH, KNOWN.not_authenticated[1]);
    return id;
  };

  /** Update/delete that must affect a row; RLS silently filters otherwise. */
  const mustAffect = (rows) => {
    if (!rows || rows.length === 0) throw new AppError(ErrorCode.FORBIDDEN, KNOWN.forbidden[1]);
  };

  return {
    kind: "supabase",

    auth: {
      async getUser() {
        const { data } = await sb.auth.getSession();
        return mapUser(data.session?.user);
      },
      onChange(cb) {
        const { data } = sb.auth.onAuthStateChange((event, session) => cb(mapUser(session?.user), event));
        return () => data.subscription.unsubscribe();
      },
      async signUp({ email, password, displayName }) {
        const res = unwrap(await sb.auth.signUp({
          email, password,
          options: { data: { display_name: displayName }, emailRedirectTo: env.appUrl + "/sign-in" },
        }));
        return { user: mapUser(res.user), needsConfirmation: !res.session };
      },
      async signIn({ email, password }) {
        return mapUser(unwrap(await sb.auth.signInWithPassword({ email, password })).user);
      },
      async signOut() {
        unwrap(await sb.auth.signOut());
      },
      async requestPasswordReset(email) {
        unwrap(await sb.auth.resetPasswordForEmail(email, { redirectTo: env.appUrl + "/reset-password" }));
      },
      async updatePassword(password) {
        unwrap(await sb.auth.updateUser({ password }));
      },
    },

    account: {
      async get() {
        const id = await uid();
        return mapAccount(unwrap(await sb.from("accounts").select("id,email,display_name,default_currency").eq("id", id).single()));
      },
      async update({ displayName, defaultCurrency }) {
        const id = await uid();
        const patch = {};
        if (displayName !== undefined) patch.display_name = displayName;
        if (defaultCurrency !== undefined) patch.default_currency = defaultCurrency;
        return mapAccount(unwrap(await sb.from("accounts").update(patch).eq("id", id).select("id,email,display_name,default_currency").single()));
      },
    },

    profiles: {
      async list() {
        const id = await uid();
        const rows = unwrap(await sb.from("profile_members")
          .select("role, profile:profiles(id,name,currency,owner_id,updated_at)")
          .eq("user_id", id));
        return rows.filter((r) => r.profile).map((r) => mapMeta(r.profile, r.role))
          .sort((a, b) => a.name.localeCompare(b.name));
      },
      async get(profileId) {
        const id = await uid();
        const [p, m] = await Promise.all([
          sb.from("profiles").select("id,name,currency,owner_id,updated_at,data,version").eq("id", profileId).maybeSingle(),
          sb.from("profile_members").select("role").eq("profile_id", profileId).eq("user_id", id).maybeSingle(),
        ]);
        const row = unwrap(p), mem = unwrap(m);
        if (!row || !mem) throw new AppError(ErrorCode.NOT_FOUND, KNOWN.not_found[1]);
        return { ...mapMeta(row, mem.role), data: row.data, version: row.version };
      },
      async create({ name, currency, data }) {
        return unwrap(await sb.rpc("create_profile", { p_name: name, p_currency: currency, p_data: data }));
      },
      async updateMeta(profileId, { name, currency }) {
        const patch = {};
        if (name !== undefined) patch.name = name;
        if (currency !== undefined) patch.currency = currency;
        mustAffect(unwrap(await sb.from("profiles").update(patch).eq("id", profileId).select("id")));
      },
      async saveData(profileId, data, expectedVersion) {
        return unwrap(await sb.rpc("save_profile_data", { p_id: profileId, p_data: data, p_expected_version: expectedVersion }));
      },
      async remove(profileId) {
        unwrap(await sb.rpc("delete_profile", { p_id: profileId }));
      },
      async leave(profileId) {
        const id = await uid();
        mustAffect(unwrap(await sb.from("profile_members").delete().eq("profile_id", profileId).eq("user_id", id).select("user_id")));
      },
      subscribe(profileId, cb) {
        const channel = sb.channel("profile:" + profileId)
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: "id=eq." + profileId },
            (payload) => cb({ version: payload.new.version, data: payload.new.data, name: payload.new.name, currency: payload.new.currency }))
          .subscribe();
        return () => { sb.removeChannel(channel); };
      },
    },

    sharing: {
      async members(profileId) {
        const rows = unwrap(await sb.from("profile_members")
          .select("user_id, role, created_at, account:accounts(email, display_name)")
          .eq("profile_id", profileId)
          .order("created_at"));
        return rows.map((r) => ({
          userId: r.user_id, role: r.role, joinedAt: r.created_at,
          email: r.account?.email || "", displayName: r.account?.display_name || "",
        }));
      },
      async setRole(profileId, userId, role) {
        mustAffect(unwrap(await sb.from("profile_members").update({ role }).eq("profile_id", profileId).eq("user_id", userId).select("user_id")));
      },
      async removeMember(profileId, userId) {
        mustAffect(unwrap(await sb.from("profile_members").delete().eq("profile_id", profileId).eq("user_id", userId).select("user_id")));
      },
      async invitations(profileId) {
        const rows = unwrap(await sb.from("invitations")
          .select("id, profile_id, email, role, expires_at, created_at")
          .eq("profile_id", profileId).eq("status", "pending")
          .order("created_at", { ascending: false }));
        return rows.map((r) => ({ id: r.id, profileId: r.profile_id, email: r.email, role: r.role, expiresAt: r.expires_at, createdAt: r.created_at }));
      },
      async invite(profileId, { email, role }) {
        const r = unwrap(await sb.rpc("create_invitation", { p_profile: profileId, p_email: email, p_role: role }));
        return { id: r.id, profileId: r.profile_id, email: r.email, role: r.role, expiresAt: r.expires_at, createdAt: r.created_at };
      },
      async revoke(invitationId) {
        unwrap(await sb.rpc("revoke_invitation", { p_id: invitationId }));
      },
      async incoming() {
        const rows = unwrap(await sb.rpc("my_invitations"));
        return rows.map((r) => ({
          id: r.id, profileId: r.profile_id, profileName: r.profile_name, role: r.role,
          invitedByName: r.invited_by_name, invitedByEmail: r.invited_by_email, expiresAt: r.expires_at,
        }));
      },
      async respond(invitationId, accept) {
        return unwrap(await sb.rpc("respond_invitation", { p_id: invitationId, p_accept: accept }));
      },
      async activity(profileId) {
        const rows = unwrap(await sb.from("audit_log")
          .select("id, action, details, created_at, actor:accounts(email, display_name)")
          .eq("profile_id", profileId)
          .order("created_at", { ascending: false })
          .limit(50));
        return rows.map((r) => ({ id: String(r.id), action: r.action, details: r.details, actorName: nameOf(r.actor), createdAt: r.created_at }));
      },
    },
  };
}
