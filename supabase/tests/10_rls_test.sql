\set ON_ERROR_STOP 1
-- users (inserted as superuser, like GoTrue does)
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a','owner@x.com', now(), '{"display_name":"Olivia"}'),
 ('00000000-0000-0000-0000-00000000000b','Partner@X.com', now(), '{"display_name":"Pat"}'),
 ('00000000-0000-0000-0000-00000000000c','stranger@x.com', now(), '{}'),
 ('00000000-0000-0000-0000-00000000000d','unverified@x.com', null, '{}');
select count(*) = 4 as accounts_created_by_trigger from public.accounts \gset
\if :accounts_created_by_trigger \else \echo FAIL accounts trigger \quit \endif

create or replace function pg_temp.expect_error(sql text, pattern text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'EXPECTED ERROR matching % but succeeded: %', pattern, sql;
exception when others then
  if sqlerrm like 'EXPECTED ERROR%' then raise; end if;
  if sqlerrm !~* pattern then raise exception 'wrong error for %: % (wanted %)', sql, sqlerrm, pattern; end if;
end $$;
grant execute on function pg_temp.expect_error(text, text) to authenticated;

-- ===== owner =====
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select public.create_profile('Household', 'LKR', '{"v":4}') as pid \gset
select public.create_profile('Business', 'USD', '{}') as pid2 \gset
select count(*) = 2 as ok from profile_members where user_id = auth.uid() and role = 'owner' \gset
\if :ok \echo PASS owner can create multiple profiles \else \echo FAIL multi profile \quit \endif

-- direct writes that must be blocked by grants
select pg_temp.expect_error($$insert into profiles(owner_id,name) values (auth.uid(),'x')$$, 'permission denied');
select pg_temp.expect_error(format($$update profiles set owner_id = '00000000-0000-0000-0000-00000000000c' where id = %L$$, :'pid'), 'permission denied');
select pg_temp.expect_error(format($$update profiles set data = '{}' where id = %L$$, :'pid'), 'permission denied');
select pg_temp.expect_error($$insert into profile_members values (gen_random_uuid(), auth.uid(), 'owner')$$, 'permission denied');
select pg_temp.expect_error($$select public.write_audit(null, 'forged')$$, 'permission denied');
select pg_temp.expect_error($$insert into audit_log(action) values ('forged')$$, 'permission denied');
\echo PASS direct writes blocked (owner_id, data, members, audit)

select public.save_profile_data(:'pid', '{"v":4,"n":1}', 1) = 2 as ok \gset
\if :ok \echo PASS owner saves with version \else \echo FAIL save \quit \endif
select pg_temp.expect_error(format($$select public.save_profile_data(%L, '{}', 1)$$, :'pid'), 'version_conflict');
\echo PASS stale version rejected

select pg_temp.expect_error(format($$select public.create_invitation(%L, 'owner@x.com', 'editor')$$, :'pid'), 'cannot_invite_self');
select pg_temp.expect_error(format($$select public.create_invitation(%L, 'p@x.com', 'owner')$$, :'pid'), 'invalid_role');
select (public.create_invitation(:'pid', '  PARTNER@x.com ', 'viewer')).id as inv \gset
select (public.create_invitation(:'pid', 'partner@x.com', 'editor')).id = :'inv' as ok \gset
\if :ok \echo PASS re-invite updates the pending invitation \else \echo FAIL reinvite \quit \endif
select (public.create_invitation(:'pid', 'unverified@x.com', 'viewer')).id as inv_unv \gset
select (public.create_invitation(:'pid2', 'stranger@x.com', 'viewer')).id as inv_revoke \gset
select public.revoke_invitation(:'inv_revoke');

-- ===== stranger =====
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select count(*) = 0 as ok from profiles \gset
\if :ok \echo PASS stranger sees no profiles \else \echo FAIL stranger profiles \quit \endif
select count(*) = 0 as ok from invitations \gset
\if :ok \echo PASS stranger sees no invitation rows \else \echo FAIL \quit \endif
select count(*) = 0 as ok from my_invitations() \gset
\if :ok \echo PASS revoked invitation not listed \else \echo FAIL revoked listed \quit \endif
select pg_temp.expect_error(format($$select public.respond_invitation(%L, true)$$, :'inv'), 'not_found');
select pg_temp.expect_error(format($$select public.respond_invitation(%L, true)$$, :'inv_revoke'), 'invitation_expired');
select pg_temp.expect_error(format($$select public.save_profile_data(%L, '{}', 2)$$, :'pid'), 'forbidden');
select count(*) = 1 as ok from accounts \gset
\if :ok \echo PASS stranger sees only own account \else \echo FAIL accounts leak \quit \endif
\echo PASS stranger cannot accept others invitations or write

-- ===== unverified email cannot accept =====
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select pg_temp.expect_error(format($$select public.respond_invitation(%L, true)$$, :'inv_unv'), 'email_not_confirmed');
\echo PASS unverified email cannot accept

-- ===== partner =====
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select count(*) = 1 and bool_and(role = 'editor') and bool_and(profile_name = 'Household') as ok from my_invitations() \gset
\if :ok \echo PASS partner sees invitation (case-insensitive email) \else \echo FAIL partner invite \quit \endif
select public.respond_invitation(:'inv', true) = :'pid' as ok \gset
\if :ok \echo PASS partner accepts \else \echo FAIL accept \quit \endif
select pg_temp.expect_error(format($$select public.respond_invitation(%L, true)$$, :'inv'), 'invitation_expired');
select count(*) = 1 as ok from profiles \gset
\if :ok \echo PASS partner sees only the shared profile \else \echo FAIL \quit \endif
select count(*) = 2 as ok from accounts \gset
\if :ok \echo PASS partner sees co-member account \else \echo FAIL \quit \endif
select public.save_profile_data(:'pid', '{"v":4,"n":2}', 2) = 3 as ok \gset
\if :ok \echo PASS editor saves \else \echo FAIL editor save \quit \endif
select pg_temp.expect_error(format($$select public.create_invitation(%L, 'z@x.com', 'viewer')$$, :'pid'), 'forbidden');
select pg_temp.expect_error(format($$select public.delete_profile(%L)$$, :'pid'), 'forbidden');
update profiles set name = 'Hacked' where id = :'pid';
select name = 'Household' as ok from profiles where id = :'pid' \gset
\if :ok \echo PASS editor cannot rename \else \echo FAIL rename \quit \endif
update profile_members set role = 'owner' where profile_id = :'pid' and user_id = auth.uid();
delete from profile_members where profile_id = :'pid' and role = 'owner';
select count(*) = 1 as ok from profile_members where profile_id = :'pid' and role = 'owner' and user_id = '00000000-0000-0000-0000-00000000000a' \gset
\if :ok \echo PASS editor cannot self-promote or remove owner \else \echo FAIL escalation \quit \endif
select count(*) = 0 as ok from audit_log \gset
\if :ok \echo PASS non-owner cannot read audit log \else \echo FAIL audit leak \quit \endif

-- ===== owner demotes, then partner is read-only =====
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
update profile_members set role = 'viewer' where profile_id = :'pid' and user_id = '00000000-0000-0000-0000-00000000000b';
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect_error(format($$select public.save_profile_data(%L, '{}', 3)$$, :'pid'), 'forbidden');
\echo PASS viewer cannot save
delete from profile_members where profile_id = :'pid' and user_id = auth.uid();
select count(*) = 0 as ok from profiles \gset
\if :ok \echo PASS member can leave \else \echo FAIL leave \quit \endif

-- ===== owner: audit trail + delete =====
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select string_agg(action, ',' order by id) as actions from audit_log where profile_id = :'pid' \gset
\echo audit: :actions
select public.delete_profile(:'pid');
reset role;
select count(*) >= 7 as ok from audit_log where details->>'name' = 'Household' or action like 'invitation.%' or action like 'member.%' \gset
\if :ok \echo PASS audit rows survive profile deletion \else \echo FAIL audit \quit \endif
select not has_function_privilege('anon', 'public.save_profile_data(uuid,jsonb,integer)', 'execute')
   and not has_table_privilege('anon', 'public.profiles', 'select') as ok \gset
\if :ok \echo PASS anon has no access \else \echo FAIL anon \quit \endif
\echo ALL RLS CHECKS PASSED
