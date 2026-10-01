-- =====================================================================
-- Monthly Money Plan — accounts, profiles, sharing, invitations, audit.
--
-- Model
--   account          1 per auth user (display name, preferences)
--   profile          a money plan; an account can own or join many
--   profile_members  who can see a profile and with which role
--   invitations      pending access grants, addressed by email
--   audit_log        append-only trail of security-relevant actions
--
-- Roles:  owner  — everything, incl. sharing and delete
--         editor — edit plan data
--         viewer — read only
--
-- Security: RLS on every table. Writes that need cross-row checks go
-- through SECURITY DEFINER functions with a pinned search_path and
-- explicit auth.uid() checks. The anon role gets nothing.
-- =====================================================================

create extension if not exists pgcrypto;

create type public.member_role as enum ('owner', 'editor', 'viewer');
create type public.invite_status as enum ('pending', 'accepted', 'declined', 'revoked');

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table public.accounts (
  id               uuid primary key references auth.users (id) on delete cascade,
  email            text not null,
  display_name     text not null default '' check (char_length(display_name) <= 80),
  default_currency text not null default 'LKR' check (default_currency ~ '^[A-Z]{3}$'),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.profiles (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.accounts (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  currency    text not null default 'LKR' check (currency ~ '^[A-Z]{3}$'),
  data        jsonb not null default '{}'::jsonb
              check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 2000000),
  version     integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.accounts (id) on delete set null
);
create index profiles_owner_idx on public.profiles (owner_id);

create table public.profile_members (
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  user_id     uuid not null references public.accounts (id) on delete cascade,
  role        public.member_role not null,
  created_at  timestamptz not null default now(),
  primary key (profile_id, user_id)
);
create index profile_members_user_idx on public.profile_members (user_id);
-- exactly one owner row per profile
create unique index profile_members_one_owner on public.profile_members (profile_id) where role = 'owner';

create table public.invitations (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  email         text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role          public.member_role not null check (role <> 'owner'),
  status        public.invite_status not null default 'pending',
  invited_by    uuid references public.accounts (id) on delete set null,
  expires_at    timestamptz not null default now() + interval '14 days',
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  responded_by  uuid references public.accounts (id) on delete set null
);
create unique index invitations_one_pending on public.invitations (profile_id, email) where status = 'pending';
create index invitations_email_idx on public.invitations (email) where status = 'pending';

-- Kept when a profile or actor is deleted, so the trail survives.
create table public.audit_log (
  id          bigint generated always as identity primary key,
  profile_id  uuid references public.profiles (id) on delete set null,
  actor_id    uuid references public.accounts (id) on delete set null,
  action      text not null,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_profile_idx on public.audit_log (profile_id, created_at desc);

-- ---------------------------------------------------------------------
-- Helpers (SECURITY DEFINER so RLS policies can call them without recursion)
-- ---------------------------------------------------------------------

create function public.my_role(p_profile uuid) returns public.member_role
language sql stable security definer set search_path = public as $$
  select role from public.profile_members where profile_id = p_profile and user_id = auth.uid()
$$;

create function public.is_member(p_profile uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role(p_profile) is not null
$$;

create function public.is_owner(p_profile uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role(p_profile) = 'owner', false)
$$;

create function public.can_edit(p_profile uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role(p_profile) in ('owner', 'editor'), false)
$$;

create function public.shares_profile_with(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profile_members a
    join public.profile_members b on a.profile_id = b.profile_id
    where a.user_id = auth.uid() and b.user_id = p_user
  )
$$;

create function public.my_email() returns text
language sql stable security definer set search_path = public, auth as $$
  select lower(email) from auth.users where id = auth.uid()
$$;

create function public.write_audit(p_profile uuid, p_action text, p_details jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_log (profile_id, actor_id, action, details)
  values (p_profile, auth.uid(), p_action, coalesce(p_details, '{}'::jsonb))
$$;

create function public.require_user() returns uuid
language plpgsql stable as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  return auth.uid();
end $$;

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.accounts (id, email, display_name)
  values (new.id, lower(new.email), coalesce(left(btrim(new.raw_user_meta_data ->> 'display_name'), 80), ''));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Users who signed up before this migration ran have no account row yet.
insert into public.accounts (id, email, display_name)
select id, lower(email), coalesce(left(btrim(raw_user_meta_data ->> 'display_name'), 80), '')
  from auth.users
on conflict (id) do nothing;

create function public.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.accounts set email = lower(new.email), updated_at = now() where id = new.id;
  return new;
end $$;

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger accounts_touch before update on public.accounts
  for each row execute function public.touch_updated_at();

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

create function public.audit_member_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    perform public.write_audit(new.profile_id, 'member.role_changed',
      jsonb_build_object('user_id', new.user_id, 'from', old.role, 'to', new.role));
    return new;
  elsif tg_op = 'DELETE' then
    -- Cascading from delete_profile: the profile is gone and 'profile.deleted' is already logged.
    if not exists (select 1 from public.profiles where id = old.profile_id) then
      return old;
    end if;
    perform public.write_audit(old.profile_id,
      case when old.user_id = auth.uid() then 'member.left' else 'member.removed' end,
      jsonb_build_object('user_id', old.user_id, 'role', old.role));
    return old;
  end if;
  return null;
end $$;

create trigger profile_members_audit after update or delete on public.profile_members
  for each row execute function public.audit_member_change();

-- ---------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------

create function public.create_profile(p_name text, p_currency text, p_data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.require_user();
  v_id  uuid;
begin
  if (select count(*) from public.profiles where owner_id = v_uid) >= 50 then
    raise exception 'profile_limit' using errcode = '54000', hint = 'An account can own at most 50 profiles.';
  end if;
  insert into public.profiles (owner_id, name, currency, data, updated_by)
  values (v_uid, btrim(p_name), upper(coalesce(p_currency, 'LKR')), coalesce(p_data, '{}'::jsonb), v_uid)
  returning id into v_id;
  insert into public.profile_members (profile_id, user_id, role) values (v_id, v_uid, 'owner');
  perform public.write_audit(v_id, 'profile.created', jsonb_build_object('name', btrim(p_name)));
  return v_id;
end $$;

-- Optimistic concurrency: the write only lands if nobody saved since you loaded.
create function public.save_profile_data(p_id uuid, p_data jsonb, p_expected_version integer)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_version integer;
begin
  perform public.require_user();
  if not public.can_edit(p_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.profiles
     set data = p_data, version = version + 1, updated_by = auth.uid()
   where id = p_id and version = p_expected_version
  returning version into v_version;
  if v_version is null then
    raise exception 'version_conflict' using errcode = '40001';
  end if;
  return v_version;
end $$;

create function public.create_invitation(p_profile uuid, p_email text, p_role public.member_role)
returns public.invitations language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(btrim(p_email));
  v_row   public.invitations;
begin
  perform public.require_user();
  if not public.is_owner(p_profile) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_role = 'owner' then
    raise exception 'invalid_role' using errcode = '22023';
  end if;
  if v_email = public.my_email() then
    raise exception 'cannot_invite_self' using errcode = '22023';
  end if;
  if exists (select 1 from public.profile_members m join public.accounts a on a.id = m.user_id
             where m.profile_id = p_profile and a.email = v_email) then
    raise exception 'already_member' using errcode = '23505';
  end if;
  if (select count(*) from public.invitations where profile_id = p_profile and status = 'pending') >= 25 then
    raise exception 'invite_limit' using errcode = '54000';
  end if;

  insert into public.invitations (profile_id, email, role, invited_by)
  values (p_profile, v_email, p_role, auth.uid())
  on conflict (profile_id, email) where status = 'pending'
  do update set role = excluded.role, invited_by = excluded.invited_by,
                expires_at = now() + interval '14 days', created_at = now()
  returning * into v_row;

  perform public.write_audit(p_profile, 'invitation.created',
    jsonb_build_object('invitation_id', v_row.id, 'email', v_email, 'role', p_role));
  return v_row;
end $$;

create function public.revoke_invitation(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_inv public.invitations;
begin
  perform public.require_user();
  select * into v_inv from public.invitations where id = p_id;
  if v_inv.id is null or not public.is_owner(v_inv.profile_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.invitations set status = 'revoked', responded_at = now(), responded_by = auth.uid()
   where id = p_id and status = 'pending';
  perform public.write_audit(v_inv.profile_id, 'invitation.revoked', jsonb_build_object('invitation_id', p_id, 'email', v_inv.email));
end $$;

-- Invitations addressed to the signed-in user (by verified email).
create function public.my_invitations()
returns table (
  id uuid, profile_id uuid, profile_name text, role public.member_role,
  invited_by_name text, invited_by_email text, expires_at timestamptz, created_at timestamptz
) language sql stable security definer set search_path = public as $$
  select i.id, i.profile_id, p.name, i.role, a.display_name, a.email, i.expires_at, i.created_at
    from public.invitations i
    join public.profiles p on p.id = i.profile_id
    left join public.accounts a on a.id = i.invited_by
   where i.email = public.my_email()
     and i.status = 'pending'
     and i.expires_at > now()
   order by i.created_at desc
$$;

create function public.respond_invitation(p_id uuid, p_accept boolean)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid uuid := public.require_user();
  v_inv public.invitations;
begin
  select * into v_inv from public.invitations where id = p_id for update;
  -- Same error for "missing" and "not yours" so invitation ids can't be probed.
  if v_inv.id is null or v_inv.email <> public.my_email() then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_inv.status <> 'pending' or v_inv.expires_at <= now() then
    raise exception 'invitation_expired' using errcode = '22023';
  end if;
  if p_accept and (select email_confirmed_at from auth.users where id = v_uid) is null then
    raise exception 'email_not_confirmed' using errcode = '42501';
  end if;

  update public.invitations
     set status = case when p_accept then 'accepted'::public.invite_status else 'declined'::public.invite_status end,
         responded_at = now(), responded_by = v_uid
   where id = p_id;

  if p_accept then
    insert into public.profile_members (profile_id, user_id, role)
    values (v_inv.profile_id, v_uid, v_inv.role)
    on conflict (profile_id, user_id) do nothing;
  end if;

  perform public.write_audit(v_inv.profile_id,
    case when p_accept then 'invitation.accepted' else 'invitation.declined' end,
    jsonb_build_object('invitation_id', p_id, 'role', v_inv.role));
  return v_inv.profile_id;
end $$;

create function public.delete_profile(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  perform public.require_user();
  if not public.is_owner(p_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select name into v_name from public.profiles where id = p_id;
  perform public.write_audit(p_id, 'profile.deleted', jsonb_build_object('name', v_name));
  delete from public.profiles where id = p_id;
end $$;

-- ---------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------

alter table public.accounts        enable row level security;
alter table public.profiles        enable row level security;
alter table public.profile_members enable row level security;
alter table public.invitations     enable row level security;
alter table public.audit_log       enable row level security;

-- accounts: see yourself and people you share a profile with; edit only yourself
create policy accounts_select on public.accounts for select to authenticated
  using (id = auth.uid() or public.shares_profile_with(id));
create policy accounts_update on public.accounts for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- profiles: members read; owner renames; data writes go through save_profile_data
create policy profiles_select on public.profiles for select to authenticated
  using (public.is_member(id));
create policy profiles_update on public.profiles for update to authenticated
  using (public.is_owner(id)) with check (public.is_owner(id));

-- members: members see each other; owner changes roles / removes others; anyone but the owner may leave
create policy members_select on public.profile_members for select to authenticated
  using (public.is_member(profile_id));
create policy members_update on public.profile_members for update to authenticated
  using (public.is_owner(profile_id) and user_id <> auth.uid() and role <> 'owner')
  with check (role in ('editor', 'viewer'));
create policy members_delete on public.profile_members for delete to authenticated
  using ((public.is_owner(profile_id) and user_id <> auth.uid()) or (user_id = auth.uid() and role <> 'owner'));

-- invitations: owner sees the profile's invitations (the invitee uses my_invitations())
create policy invitations_select on public.invitations for select to authenticated
  using (public.is_owner(profile_id));

-- audit: owners read their profile's trail; nobody writes directly
create policy audit_select on public.audit_log for select to authenticated
  using (profile_id is not null and public.is_owner(profile_id));

-- ---------------------------------------------------------------------
-- Grants: least privilege. Column-level updates stop editors/owners
-- from rewriting owner_id, version or data outside the RPC.
-- ---------------------------------------------------------------------

revoke all on public.accounts, public.profiles, public.profile_members, public.invitations, public.audit_log from anon, authenticated;

grant select on public.accounts, public.profiles, public.profile_members, public.invitations, public.audit_log to authenticated;
grant update (display_name, default_currency) on public.accounts to authenticated;
grant update (name, currency) on public.profiles to authenticated;
grant update (role) on public.profile_members to authenticated;
grant delete on public.profile_members to authenticated;

-- Internal helpers (write_audit, require_user, trigger functions) stay uncallable over the API.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.create_profile(text, text, jsonb),
  public.save_profile_data(uuid, jsonb, integer),
  public.create_invitation(uuid, text, public.member_role),
  public.revoke_invitation(uuid),
  public.my_invitations(),
  public.respond_invitation(uuid, boolean),
  public.delete_profile(uuid),
  public.my_role(uuid), public.is_member(uuid), public.is_owner(uuid), public.can_edit(uuid),
  public.shares_profile_with(uuid), public.my_email()
to authenticated;

-- Live updates when a partner edits a shared profile (Realtime honours RLS).
alter publication supabase_realtime add table public.profiles;
