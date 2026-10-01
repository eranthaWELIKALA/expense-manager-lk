/* ============================================================
   Backend contract. The UI only talks to `backend`; two adapters
   implement it:
     · supabase — real auth, Postgres + RLS (production)
     · local    — browser storage demo, no server (development)

   @typedef {"owner"|"editor"|"viewer"} Role
   @typedef {{id:string, email:string, emailConfirmed:boolean}} User
   @typedef {{id:string, email:string, displayName:string, defaultCurrency:string}} Account
   @typedef {{id:string, name:string, currency:string, ownerId:string, role:Role, updatedAt:string}} ProfileMeta
   @typedef {ProfileMeta & {data:object, version:number}} Profile
   @typedef {{userId:string, email:string, displayName:string, role:Role, joinedAt:string}} Member
   @typedef {{id:string, profileId:string, email:string, role:Role, expiresAt:string, createdAt:string}} Invitation
   @typedef {{id:string, profileId:string, profileName:string, role:Role, invitedByName:string,
              invitedByEmail:string, expiresAt:string}} IncomingInvitation
   @typedef {{id:string, action:string, details:object, actorName:string, createdAt:string}} ActivityEntry

   @typedef {object} Backend
   @property {"supabase"|"local"} kind
   @property {{
     getUser(): Promise<User|null>,
     onChange(cb:(user:User|null, event:string)=>void): () => void,
     signUp(p:{email:string, password:string, displayName:string}): Promise<{user:User|null, needsConfirmation:boolean}>,
     signIn(p:{email:string, password:string}): Promise<User>,
     signOut(): Promise<void>,
     requestPasswordReset(email:string): Promise<void>,
     updatePassword(password:string): Promise<void>,
   }} auth
   @property {{ get(): Promise<Account>, update(p:{displayName?:string, defaultCurrency?:string}): Promise<Account> }} account
   @property {{
     list(): Promise<ProfileMeta[]>,
     get(id:string): Promise<Profile>,
     create(p:{name:string, currency:string, data:object}): Promise<string>,
     updateMeta(id:string, p:{name?:string, currency?:string}): Promise<void>,
     saveData(id:string, data:object, expectedVersion:number): Promise<number>,
     remove(id:string): Promise<void>,
     leave(id:string): Promise<void>,
     subscribe(id:string, cb:(row:{version:number, data:object, name:string, currency:string})=>void): () => void,
   }} profiles
   @property {{
     members(profileId:string): Promise<Member[]>,
     setRole(profileId:string, userId:string, role:Role): Promise<void>,
     removeMember(profileId:string, userId:string): Promise<void>,
     invitations(profileId:string): Promise<Invitation[]>,
     invite(profileId:string, p:{email:string, role:Role}): Promise<Invitation>,
     revoke(invitationId:string): Promise<void>,
     incoming(): Promise<IncomingInvitation[]>,
     respond(invitationId:string, accept:boolean): Promise<string>,
     activity(profileId:string): Promise<ActivityEntry[]>,
   }} sharing
   ============================================================ */

import { env } from "../config/env";
import { createSupabaseBackend } from "./supabase/backend";
import { createLocalBackend } from "./local/backend";

/** @type {Backend} */
export const backend = env.backend === "supabase" ? createSupabaseBackend() : createLocalBackend();

export const ROLES = /** @type {const} */ (["owner", "editor", "viewer"]);
export const INVITABLE_ROLES = [
  { id: "editor", label: "Editor", description: "Can edit the plan" },
  { id: "viewer", label: "Viewer", description: "Can only look" },
];
export const roleLabel = (r) => ({ owner: "Owner", editor: "Editor", viewer: "Viewer" })[r] || r;
export const canEditRole = (r) => r === "owner" || r === "editor";
export const inviteLink = (id) => `${env.appUrl}/invite/${encodeURIComponent(id)}`;
