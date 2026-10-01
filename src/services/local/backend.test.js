// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createLocalBackend } from "./backend";
import { blankPlan } from "../../domain";

/* Exercises the permission model end to end. These are the same rules the
   Supabase RLS policies enforce, so this doubles as a spec for them. */

const b = createLocalBackend();
const signUpAs = (email, name = email.split("@")[0]) => b.auth.signUp({ email, password: "secret123", displayName: name });
const switchTo = async (email) => { await b.auth.signOut(); await b.auth.signIn({ email, password: "secret123" }); };

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

describe("local backend: auth", () => {
  it("signs up, signs out, and rejects bad passwords", async () => {
    await signUpAs("a@x.com");
    expect((await b.auth.getUser()).email).toBe("a@x.com");
    await b.auth.signOut();
    expect(await b.auth.getUser()).toBeNull();
    await expect(b.auth.signIn({ email: "a@x.com", password: "nope1234" })).rejects.toThrow(/Invalid/);
    await expect(signUpAs("A@x.com")).rejects.toThrow(/already exists/);
    const raw = localStorage.getItem("mmp:local-db:v1");
    expect(raw).not.toContain("secret123"); // never stored in plain text
  });
});

describe("local backend: profiles and sharing", () => {
  it("supports multiple profiles per account", async () => {
    await signUpAs("owner@x.com");
    await b.profiles.create({ name: "Household", currency: "LKR", data: blankPlan("2026-08") });
    await b.profiles.create({ name: "Business", currency: "USD", data: blankPlan("2026-08") });
    const list = await b.profiles.list();
    expect(list.map((p) => p.name)).toEqual(["Business", "Household"]);
    expect(list.every((p) => p.role === "owner")).toBe(true);
  });

  it("invites a partner, enforces roles, and detects conflicting saves", async () => {
    await signUpAs("partner@x.com", "Partner");
    await b.auth.signOut();
    await signUpAs("owner@x.com", "Owner");
    const pid = await b.profiles.create({ name: "Home", currency: "LKR", data: blankPlan("2026-08") });

    await expect(b.sharing.invite(pid, { email: "owner@x.com", role: "editor" })).rejects.toThrow(/yourself/);
    await expect(b.sharing.invite(pid, { email: "p@x.com", role: "owner" })).rejects.toThrow(/editor or viewer/);
    const inv = await b.sharing.invite(pid, { email: "Partner@X.com", role: "viewer" });
    expect(inv.email).toBe("partner@x.com");

    // someone else can't see or accept it
    await b.auth.signOut();
    await signUpAs("stranger@x.com");
    expect(await b.sharing.incoming()).toEqual([]);
    await expect(b.sharing.respond(inv.id, true)).rejects.toThrow();
    await expect(b.profiles.get(pid)).rejects.toThrow();

    // the invitee accepts
    await switchTo("partner@x.com");
    const incoming = await b.sharing.incoming();
    expect(incoming).toHaveLength(1);
    expect(incoming[0]).toMatchObject({ profileName: "Home", role: "viewer", invitedByName: "Owner" });
    expect(await b.sharing.respond(inv.id, true)).toBe(pid);
    await expect(b.sharing.respond(inv.id, true)).rejects.toThrow(/expired|used/);

    // viewers can read but not write or manage
    const p = await b.profiles.get(pid);
    expect(p.role).toBe("viewer");
    await expect(b.profiles.saveData(pid, p.data, p.version)).rejects.toThrow(/permission/);
    await expect(b.sharing.invite(pid, { email: "z@x.com", role: "viewer" })).rejects.toThrow(/permission/);
    await expect(b.profiles.remove(pid)).rejects.toThrow(/permission/);

    // owner promotes to editor; both edit; stale version is rejected
    await switchTo("owner@x.com");
    const members = await b.sharing.members(pid);
    const partner = members.find((m) => m.email === "partner@x.com");
    await b.sharing.setRole(pid, partner.userId, "editor");
    const base = await b.profiles.get(pid);
    const v2 = await b.profiles.saveData(pid, { ...base.data, active: "2026-09" }, base.version);
    expect(v2).toBe(base.version + 1);

    await switchTo("partner@x.com");
    await expect(b.profiles.saveData(pid, base.data, base.version)).rejects.toMatchObject({ code: "conflict" });
    const fresh = await b.profiles.get(pid);
    await b.profiles.saveData(pid, fresh.data, fresh.version);

    // partner leaves; owner can't leave their own profile
    await b.profiles.leave(pid);
    await expect(b.profiles.get(pid)).rejects.toThrow();
    await switchTo("owner@x.com");
    await expect(b.profiles.leave(pid)).rejects.toThrow(/permission/);

    const log = (await b.sharing.activity(pid)).map((a) => a.action);
    expect(log).toEqual(expect.arrayContaining(["profile.created", "invitation.created", "invitation.accepted", "member.role_changed", "member.left"]));
  });

  it("revoked invitations can't be accepted", async () => {
    await signUpAs("owner@x.com");
    const pid = await b.profiles.create({ name: "Home", currency: "LKR", data: blankPlan() });
    const inv = await b.sharing.invite(pid, { email: "late@x.com", role: "editor" });
    await b.sharing.revoke(inv.id);
    expect(await b.sharing.invitations(pid)).toEqual([]);
    await b.auth.signOut();
    await signUpAs("late@x.com");
    expect(await b.sharing.incoming()).toEqual([]);
    await expect(b.sharing.respond(inv.id, true)).rejects.toThrow();
  });
});
