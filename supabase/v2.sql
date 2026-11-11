-- Additive V2 upgrade; preserves rooms and players.
-- Run the whole file in Supabase SQL Editor.
-- Vampir Köylü V2.1. Idempotent upgrade: preserves existing rooms and players.
-- Secrets, roles and ballots live in an unexposed schema. Clients only call RPCs.
begin;
create schema if not exists vk_private;
revoke all on schema vk_private from public, anon, authenticated;

create table if not exists vk_private.rooms (
 id uuid primary key default gen_random_uuid(),
 code text not null unique,
 host_id uuid not null,
 created_at timestamptz not null default now(),
 settings jsonb not null,
 phase text not null default 'lobby',
 seq integer not null default 0,
 day integer not null default 1,
 started_at timestamptz not null default now(),
 ends_at timestamptz,
 night_step text,
 victim uuid,
 protected uuid,
 winner text,
 announcement jsonb,
 events jsonb not null default '[]'
);
-- Additive migration, safe on v1 databases.
alter table vk_private.rooms add column if not exists speech_order uuid[] not null default '{}';
alter table vk_private.rooms add column if not exists speech_turn int not null default 0;
alter table vk_private.rooms add column if not exists speech_slot_ms int not null default 0;
alter table vk_private.rooms add column if not exists speech_ends_at timestamptz;
alter table vk_private.rooms add column if not exists round_number int not null default 1;
alter table vk_private.rooms add column if not exists pin_hash text;
alter table vk_private.rooms add column if not exists vampire_decision jsonb;

-- Creator identity stays fixed for quota; hosting may move independently.
alter table vk_private.rooms add column if not exists creator_id uuid;
update vk_private.rooms set creator_id=host_id where creator_id is null;
alter table vk_private.rooms alter column creator_id set not null;
alter table vk_private.rooms add column if not exists host_seen_at timestamptz not null default now();
alter table vk_private.rooms add column if not exists host_revision int not null default 0;
alter table vk_private.rooms add column if not exists observer_ids uuid[] not null default '{}';
alter table vk_private.rooms add column if not exists vote_candidates uuid[] not null default '{}';
alter table vk_private.rooms add column if not exists summary_complete boolean not null default false;
create index if not exists vk_rooms_creator on vk_private.rooms(creator_id,created_at);

create table if not exists vk_private.players (
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references vk_private.rooms(id) on delete cascade,
 user_id uuid not null,
 number integer not null,
 name text not null check (char_length(name) between 1 and 20),
 role text not null default 'villager',
 alive boolean not null default true,
 self_heal_used boolean not null default false,
 eliminated_by text,
 last_seen timestamptz not null default now(),
 unique(room_id,user_id), unique(room_id,number)
);
alter table vk_private.players add column if not exists muted_day int;
alter table vk_private.players add column if not exists shot_used boolean not null default false;
alter table vk_private.players add column if not exists guilt_day int;
alter table vk_private.players add column if not exists hunter_used boolean not null default false;
alter table vk_private.rooms add column if not exists extra_victim uuid;
alter table vk_private.rooms add column if not exists guard_target uuid;
alter table vk_private.rooms add column if not exists silence_target uuid;
alter table vk_private.rooms add column if not exists bonus_attacks int not null default 0;
alter table vk_private.rooms add column if not exists hunter_pending uuid;
alter table vk_private.rooms add column if not exists hunter_resume jsonb;
alter table vk_private.rooms add column if not exists role_pool_overflow boolean not null default false;


-- Running V2 games retain their rules until their next deal/rematch.
alter table vk_private.rooms add column if not exists rules_version int not null default 2;
alter table vk_private.rooms add column if not exists tie_streak int not null default 0;
alter table vk_private.rooms add column if not exists night_base_ends_at timestamptz;
alter table vk_private.players add column if not exists wizard_used boolean not null default false;
alter table vk_private.players add column if not exists alpha_used boolean not null default false;
alter table vk_private.players add column if not exists fanatic_target uuid references vk_private.players(id);
alter table vk_private.players add column if not exists fanatic_won boolean not null default false;
alter table vk_private.players add column if not exists fanatic_won_target uuid references vk_private.players(id);
alter table vk_private.players add column if not exists role_notices jsonb not null default '[]';
create table if not exists vk_private.night_choices (
 room_id uuid not null references vk_private.rooms(id) on delete cascade,
 round_number int not null,seq int not null,actor uuid not null references vk_private.players(id),
 kind text not null,targets uuid[] not null default '{}',primary key(room_id,round_number,seq,actor)
);
alter table vk_private.night_choices enable row level security;

alter table vk_private.rooms add column if not exists closed_at timestamptz;
alter table vk_private.players add column if not exists spectator boolean not null default false;

create table if not exists vk_private.votes (
 room_id uuid not null references vk_private.rooms(id) on delete cascade,
 seq integer not null,
 voter uuid not null references vk_private.players(id),
 target uuid not null references vk_private.players(id),
 primary key(room_id,seq,voter)
);
-- Both vampires submit privately; choices remain editable until the timer expires.
create table if not exists vk_private.vampire_choices (
 room_id uuid not null references vk_private.rooms(id) on delete cascade,
 seq int not null,
 actor uuid not null references vk_private.players(id),
 target uuid not null references vk_private.players(id),
 primary key(room_id,seq,actor)
);
alter table vk_private.players add column if not exists ready boolean not null default false;
alter table vk_private.players add column if not exists kicked boolean not null default false;
alter table vk_private.players add column if not exists participating boolean not null default true;
-- Persist role-free observer membership after a host hands over management.
update vk_private.rooms r set observer_ids=array_append(observer_ids,host_id)
 where not (host_id=any(observer_ids)) and not exists(select 1 from vk_private.players p where p.room_id=r.id and p.user_id=r.host_id);
create table if not exists vk_private.round_actions (
 id bigint generated always as identity primary key,
 room_id uuid not null references vk_private.rooms(id) on delete cascade,
 round_number int not null, seq int not null, day int not null,
 kind text not null, actor uuid references vk_private.players(id), target uuid references vk_private.players(id),
 status text not null default 'pending', details jsonb not null default '{}'
);
alter table vk_private.round_actions enable row level security;
create index if not exists vk_round_actions_room on vk_private.round_actions(room_id,round_number,id);

-- Existing tied games keep their original leaders across this upgrade.
do $upgrade$
declare r vk_private.rooms; candidates uuid[];
begin
 for r in select * from vk_private.rooms where cardinality(vote_candidates)=0 and
  (phase='runoff' or (phase='voting' and announcement->>'kind'='tie')) for update loop
  with totals as (
   select target,count(*) n from vk_private.votes where room_id=r.id and seq=(
    select max(seq) from vk_private.votes where room_id=r.id and seq<r.seq) group by target
  ) select array_agg(t.target) into candidates from totals t join vk_private.players p on p.id=t.target
    where t.n=(select max(n) from totals) and p.alive and p.participating and not p.kicked;
  update vk_private.rooms set vote_candidates=coalesce(candidates,'{}'::uuid[]) where id=r.id;
 end loop;
end $upgrade$;


create table if not exists vk_private.early_votes (
 room_id uuid not null references vk_private.rooms(id) on delete cascade,
 seq integer not null,
 voter uuid not null references vk_private.players(id),
 primary key(room_id,seq,voter)
);
alter table vk_private.rooms enable row level security;
alter table vk_private.players enable row level security;
alter table vk_private.votes enable row level security;
alter table vk_private.early_votes enable row level security;
create index if not exists vk_players_room on vk_private.players(room_id);
create index if not exists vk_rooms_host on vk_private.rooms(host_id,created_at);
create table if not exists vk_private.join_attempts (
 room_id uuid not null references vk_private.rooms(id) on delete cascade,
 user_id uuid not null, failures int not null default 0,
 window_start timestamptz not null default now(), locked_until timestamptz,
 primary key(room_id,user_id)
);
alter table vk_private.join_attempts enable row level security;

-- WebRTC signaling only; audio never passes through or is stored in Postgres.
create table if not exists vk_private.voice_peers (
 room_id uuid not null references vk_private.rooms(id) on delete cascade,
 user_id uuid not null,
 session_id uuid not null,
 player_id uuid references vk_private.players(id) on delete cascade,
 mic_open boolean not null default false,
 last_seen timestamptz not null default now(),
 primary key(room_id,user_id), unique(room_id,session_id)
);
create table if not exists vk_private.voice_signals (
 id bigint generated always as identity primary key,
 room_id uuid not null references vk_private.rooms(id) on delete cascade,
 sender uuid not null,
 recipient uuid not null,
 payload jsonb not null,
 client_id uuid not null default gen_random_uuid(),
 created_at timestamptz not null default now()
);
alter table vk_private.voice_peers enable row level security;
alter table vk_private.voice_signals enable row level security;
create index if not exists vk_voice_recipient on vk_private.voice_signals(room_id,recipient,id);
create index if not exists vk_voice_expiry on vk_private.voice_signals(created_at);
alter table vk_private.voice_signals add column if not exists client_id uuid not null default gen_random_uuid();
create unique index if not exists vk_voice_message_once on vk_private.voice_signals(room_id,sender,client_id);
create index if not exists vk_voice_seen on vk_private.voice_peers(last_seen);

create or replace function vk_private.require_user() returns uuid
language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'Önce oyuna giriş yapmalısın.'; end if;
 return auth.uid();
end $$;

-- Accept v1/v2 boolean settings as well as the new three-way role options.
create or replace function vk_private.role_mode(raw jsonb, role_key text) returns text
language plpgsql immutable set search_path = '' as $$
declare mode text:=coalesce(raw->>role_key,'never');
begin
 if mode='true' then return 'always'; end if;
 if mode='false' then return 'never'; end if;
 if mode not in ('always','random','never') then raise exception 'Geçersiz rol seçeneği.'; end if;
 return mode;
end $$;

create or replace function vk_private.settings(raw jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare d int; n int; v int; e int; c int; turn_seconds int; t text;
begin
 d := coalesce((raw->>'day_seconds')::int,300);
 n := coalesce((raw->>'night_seconds')::int,15);
 v := coalesce((raw->>'vote_seconds')::int,20);
 e := coalesce((raw->>'runoff_seconds')::int,60);
 c := coalesce((raw->>'disconnect_seconds')::int,60);
 turn_seconds := coalesce((raw->>'turn_seconds')::int,30);
 t := coalesce(raw->>'theme','classic');
 if d not between 30 and 1800 or n not between 15 and 120 or v not between 20 and 120 or e not between 15 and 300 or c not between 30 and 600 or turn_seconds not between 30 and 300 then
  raise exception 'Süreler izin verilen aralıkta olmalı.';
 end if;
 if coalesce((raw->>'night_grace_seconds')::int,10) not in (5,10) then raise exception 'Gece ek süresi 5 veya 10 saniye olmalı.'; end if;
 if t not in ('classic','lavender','forest','peach','ocean','sunset','moonlight','random') then t := 'classic'; end if;
 return jsonb_build_object('day_seconds',d,'night_seconds',n,'vote_seconds',v,'runoff_seconds',e,
  'doctor',vk_private.role_mode(raw,'doctor'),'jester',vk_private.role_mode(raw,'jester'),'theme',t,
  'wizard',vk_private.role_mode(raw,'wizard'),'alpha_vampire',vk_private.role_mode(raw,'alpha_vampire'),'fanatic',vk_private.role_mode(raw,'fanatic'),'night_grace_seconds',coalesce((raw->>'night_grace_seconds')::int,10),
  'random_theme',coalesce((raw->>'random_theme')::boolean,false) or t='random', 'turn_seconds',turn_seconds,
  'two_vampires',coalesce((raw->>'two_vampires')::boolean,false),
  'mayor',vk_private.role_mode(raw,'mayor'),'bodyguard',vk_private.role_mode(raw,'bodyguard'),'hunter',vk_private.role_mode(raw,'hunter'),'shaman',vk_private.role_mode(raw,'shaman'),'gunslinger',vk_private.role_mode(raw,'gunslinger'),'vampire_cub',vk_private.role_mode(raw,'vampire_cub'),
  'host_plays',coalesce((raw->>'host_plays')::boolean,true),'turn_based',coalesce((raw->>'turn_based')::boolean,false),
  'disconnect_seconds',c,'pin_enabled',coalesce((raw->>'pin_enabled')::boolean,false),
  'voice_enabled',coalesce((raw->>'voice_enabled')::boolean,false) and coalesce((raw->>'turn_based')::boolean,false));
end $$;

-- Called under the room lock; no client can claim hosting or choose an automatic heir.
create or replace function vk_private.maintain_host(rid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r vk_private.rooms; successor vk_private.players; seen timestamptz;
begin
 select * into r from vk_private.rooms where id=rid for update;
 if not found or r.closed_at is not null then return; end if;
 select greatest(r.host_seen_at,last_seen) into seen from vk_private.players where room_id=rid and user_id=r.host_id and not kicked;
 seen:=coalesce(seen,r.host_seen_at);
 if seen>now()-make_interval(secs=>coalesce((r.settings->>'disconnect_seconds')::int,60)) then return; end if;
 select * into successor from vk_private.players where room_id=rid and (participating or spectator) and not kicked and user_id<>r.host_id
  and last_seen>now()-interval '20 seconds' order by participating desc,alive desc,number,id limit 1;
 if not found then return; end if;
 update vk_private.rooms set host_id=successor.user_id,host_seen_at=successor.last_seen,host_revision=host_revision+1,
  events=events||jsonb_build_array(jsonb_build_object('day',r.day,'text',format('Masa yönetimi bağlantı süresi dolduğu için #%s %s oyuncusuna geçti.',successor.number,successor.name))) where id=rid;
end $$;

-- Uniform sampling within each priority group; no role gets enum-order priority.
create or replace function vk_private.draw_roles(raw jsonb,slots int) returns text[]
language plpgsql volatile set search_path = '' as $$
declare options text[]:=array['doctor','jester','mayor','bodyguard','hunter','shaman','gunslinger','vampire_cub']; mandatory_roles text[]; chance_roles text[];
begin
 if (raw->>'rules_version')='3' then options:=array['doctor','jester','mayor','hunter','shaman','gunslinger','vampire_cub','wizard','fanatic']; end if;
 if slots<1 then return '{}'::text[]; end if;
 select coalesce(array_agg(k order by random()),'{}'::text[]) into mandatory_roles
  from unnest(options) as opt(k) where vk_private.role_mode(raw,k)='always';
 if cardinality(mandatory_roles)>=slots then return mandatory_roles[1:slots]; end if;
 select coalesce(array_agg(k order by random()),'{}'::text[]) into chance_roles
  from unnest(options) as opt(k) where vk_private.role_mode(raw,k)='random' and random()<0.5;
 return mandatory_roles||chance_roles[1:slots-cardinality(mandatory_roles)];
end $$;

-- All helpers execute under the room lock and are never exposed to clients.
create or replace function vk_private.can_hunt(rid uuid,pid uuid) returns boolean
language sql stable set search_path = '' as $$
 select exists(select 1 from vk_private.players p where p.id=pid and p.room_id=rid and p.alive and p.participating and not p.kicked
  and (p.role in ('vampire','alpha_vampire') or (p.role='vampire_cub' and not exists(select 1 from vk_private.players where room_id=rid and role in ('vampire','alpha_vampire') and alive and participating and not kicked))));
$$;

create or replace function vk_private.apply_death(rid uuid,pid uuid,reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare p vk_private.players;
begin
 update vk_private.players set alive=false,eliminated_by=reason where id=pid and room_id=rid and alive and participating and not kicked returning * into p;
 if not found then return; end if;
 if reason='village' then
  update vk_private.players set fanatic_won=true,fanatic_won_target=pid where room_id=rid and role='fanatic' and fanatic_target=pid and not kicked;
 end if;
 if p.role='hunter' and not p.hunter_used and reason not in ('disconnected','kicked') then
  update vk_private.rooms set hunter_pending=p.id where id=rid;
 end if;
 if p.role='vampire_cub' and reason='village' then update vk_private.rooms set bonus_attacks=2 where id=rid; end if;
end $$;

create or replace function vk_private.capture_hunter(rid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r vk_private.rooms;
begin
 select * into r from vk_private.rooms where id=rid for update;
 if r.hunter_pending is null or r.phase in ('hunter','finished','lobby') then return; end if;
 if not exists(select 1 from vk_private.players where room_id=rid and alive and participating and not kicked) then
  update vk_private.rooms set hunter_pending=null where id=rid; return;
 end if;
 update vk_private.rooms set hunter_resume=jsonb_build_object('phase',phase,'remaining',greatest(0,extract(epoch from (ends_at-now()))),'paused_at',now()),
  phase='hunter',seq=seq+1,started_at=now(),ends_at=now()+interval '30 seconds' where id=rid;
end $$;

create or replace function vk_private.resolve_hunter(rid uuid,p_target uuid,automatic boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare r vk_private.rooms; p vk_private.players; paused interval;
begin
 select * into r from vk_private.rooms where id=rid for update;
 if r.phase<>'hunter' or r.hunter_pending is null then return; end if;
 select * into p from vk_private.players where id=p_target and room_id=rid and alive and participating and not kicked;
 if not found then raise exception 'Hayatta olan bir hedef seçmelisin.'; end if;
 update vk_private.players set hunter_used=true where id=r.hunter_pending;
 perform vk_private.apply_death(rid,p.id,'hunter');
 insert into vk_private.round_actions(room_id,round_number,seq,day,kind,actor,target,status,details)
 values(rid,r.round_number,r.seq,r.day,'revenge',r.hunter_pending,p.id,'resolved',jsonb_build_object('automatic',automatic));
 paused:=now()-(r.hunter_resume->>'paused_at')::timestamptz;
 update vk_private.rooms set hunter_pending=null,hunter_resume=null,
  phase=coalesce(r.hunter_resume->>'phase','day'),seq=seq+1,started_at=started_at+paused,
  ends_at=now()+make_interval(secs=>coalesce((r.hunter_resume->>'remaining')::double precision,7)),
  speech_ends_at=speech_ends_at+paused,
  announcement=jsonb_build_object('kind','hunter','text',format('Avcının son oku #%s %s oyuncusunu oyun dışı bıraktı.',p.number,p.name)),
  events=events||jsonb_build_array(jsonb_build_object('day',r.day,'text',format('Avcının son oku #%s %s oyuncusunu oyun dışı bıraktı.',p.number,p.name))) where id=rid;
end $$;

create or replace function vk_private.next_night_step(r vk_private.rooms,current_step text) returns text
language plpgsql stable set search_path = '' as $$
declare options text[]:=array['doctor','bodyguard','shaman']; k text; past boolean:=current_step not in ('doctor','bodyguard','shaman');
begin
 foreach k in array options loop
  if past and (vk_private.role_mode(r.settings,k)='random' or (r.role_pool_overflow and vk_private.role_mode(r.settings,k)='always') or exists(select 1 from vk_private.players where room_id=r.id and alive and participating and not kicked and role=k)) then return k; end if;
  if k=current_step then past:=true; end if;
 end loop;
 return 'resolve';
end $$;

create or replace function vk_private.resolve_night(rid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r vk_private.rooms; target_id uuid; killed_id uuid; guard_id uuid; p vk_private.players; deaths text[]:='{}'; saved boolean; outcome text; sacrificed boolean:=false;
begin
 select * into r from vk_private.rooms where id=rid for update;
 select id into guard_id from vk_private.players where room_id=rid and role='bodyguard' and alive and participating and not kicked;
 -- Protection applies to the attacked player first. A guard then sacrifices itself for an unprotected target.
 foreach target_id in array array[r.victim,r.extra_victim] loop
  if target_id is null then continue; end if;
  saved:=target_id is not distinct from r.protected;
  killed_id:=target_id; outcome:='killed';
  if saved then outcome:='saved';
  elsif target_id=r.guard_target and guard_id is not null then
   killed_id:=guard_id; outcome:='guarded'; sacrificed:=true;
  end if;
  if not saved then
   select * into p from vk_private.players where id=killed_id and alive;
   if found then
    perform vk_private.apply_death(rid,killed_id,case when outcome='guarded' then 'bodyguard' else 'vampire' end);
    deaths:=array_append(deaths,format('#%s %s',p.number,p.name));
   end if;
  end if;
  update vk_private.round_actions set status='resolved',details=details||jsonb_build_object('outcome',outcome)
   where room_id=rid and round_number=r.round_number and day=r.day and kind='kill' and status='pending' and target=target_id;
 end loop;
 update vk_private.round_actions set status='resolved',details=details||jsonb_build_object('outcome',case when kind='protect' and target in (r.victim,r.extra_victim) then 'saved' when kind='guard' and target in (r.victim,r.extra_victim) and target is distinct from r.protected then 'guarded' else 'missed' end)
  where room_id=rid and round_number=r.round_number and day=r.day and kind in ('protect','guard') and status='pending';
 update vk_private.round_actions set status='resolved',details=details||jsonb_build_object('outcome','missed')
  where room_id=rid and round_number=r.round_number and day=r.day and kind='kill' and status='pending';
 if r.silence_target is not null then
  update vk_private.players set muted_day=r.day+1 where id=r.silence_target and alive;
  update vk_private.round_actions set status='resolved' where room_id=rid and round_number=r.round_number and day=r.day and kind='silence' and status='pending';
 end if;
 if cardinality(deaths)=0 then
  r.announcement:=jsonb_build_object('kind','saved','text','Günaydın köy! Bu gece kimse ölmedi.');
 else
  r.announcement:=jsonb_build_object('kind',case when sacrificed then 'bodyguard' else 'night_death' end,
   'text',array_to_string(deaths,' ve ')||' bu gece köye veda etti.');
 end if;
 update vk_private.rooms set announcement=r.announcement,events=events||jsonb_build_array(jsonb_build_object('day',r.day,'text',r.announcement->>'text')) where id=rid;
end $$;

-- V2.1 concurrent night helpers. Included by setup.sql and the additive upgrade.
create or replace function vk_private.faction(role_key text) returns text
language sql immutable set search_path = '' as $$
 select case when role_key in ('vampire','alpha_vampire','vampire_cub') then 'vampire'
 when role_key in ('jester','fanatic') then 'independent' else 'village' end;
$$;

create or replace function vk_private.player_won(p vk_private.players,winner text) returns boolean
language sql stable set search_path = '' as $$
 select p.fanatic_won or case when p.role='fanatic' then false when p.role='jester' then winner='jester'
 else vk_private.faction(p.role)=winner end;
$$;

create or replace function vk_private.night_actor(r vk_private.rooms,p vk_private.players) returns boolean
language sql stable set search_path = '' as $$
 select p.room_id=r.id and p.alive and p.participating and not p.kicked and
 (vk_private.can_hunt(r.id,p.id) or p.role in ('doctor','shaman','bodyguard') or (p.role='wizard' and not p.wizard_used));
$$;

-- A role and all its committed effects travel through the same permutation.
create or replace function vk_private.swap_destination(pid uuid,a uuid,b uuid) returns uuid
language sql immutable set search_path = '' as $$
 select case when pid=a then b when pid=b then a else pid end;
$$;

create or replace function public.vk_night_action(p_code text,p_seq int,p_action text,p_targets uuid[] default '{}') returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=vk_private.require_user(); r vk_private.rooms; me vk_private.players; t uuid; expected int;
begin
 select * into r from vk_private.rooms where code=upper(btrim(p_code)) for update;
 if not found then raise exception 'Masa bulunamadı.'; end if;
 perform vk_private.advance(r.id);
 select * into r from vk_private.rooms where id=r.id;
 select * into me from vk_private.players where room_id=r.id and user_id=uid;
 if me.kicked then raise exception using errcode='VK001',message='Bu masadan çıkarıldın.'; end if;
 if r.rules_version<3 or r.phase<>'night' or r.seq is distinct from p_seq or now()>=r.ends_at then raise exception 'Gece seçim süresi bitti. Ekran güncelleniyor.'; end if;
 if me.id is null or not vk_private.night_actor(r,me) then raise exception 'Bu gece kullanabileceğin bir yetenek yok.'; end if;
 if p_targets is null or array_position(p_targets,null) is not null or cardinality(p_targets)>2
 or cardinality(p_targets)<>(select count(distinct x) from unnest(p_targets) x) then raise exception 'Geçerli ve farklı hedefler seçmelisin.'; end if;
 if p_action='skip' then expected:=0;
 elsif p_action='kill' and vk_private.can_hunt(r.id,me.id) then expected:=case when r.bonus_attacks=2 then 2 else 1 end;
 elsif p_action='bite' and me.role='alpha_vampire' and not me.alpha_used then expected:=1;
 elsif p_action='protect' and me.role='doctor' then expected:=1;
 elsif p_action='silence' and me.role='shaman' then expected:=1;
 elsif p_action='guard' and me.role='bodyguard' then expected:=1;
 elsif p_action='swap' and me.role='wizard' and not me.wizard_used then expected:=2;
 else raise exception 'Bu yeteneği kullanamazsın.'; end if;
 -- A cub's second attack may be left unused; the first remains valid.
 if cardinality(p_targets)<>expected and not(p_action='kill' and expected=2 and cardinality(p_targets)=1) then raise exception 'Bu yetenek için uygun sayıda hedef seçmelisin.'; end if;
 foreach t in array p_targets loop
  if not exists(select 1 from vk_private.players where id=t and room_id=r.id and alive and participating and not kicked) then raise exception 'Hayatta olan bir hedef seçmelisin.'; end if;
  if t=me.id and (p_action<>'protect' or me.self_heal_used) then raise exception 'Kendini bu hamlede seçemezsin.'; end if;
  if p_action in ('kill','bite') and exists(select 1 from vk_private.players where id=t and vk_private.faction(role)='vampire') then raise exception 'Vampir takım arkadaşını hedefleyemezsin.'; end if;
 end loop;
 insert into vk_private.night_choices(room_id,round_number,seq,actor,kind,targets)
 values(r.id,r.round_number,r.seq,me.id,p_action,p_targets)
 on conflict(room_id,round_number,seq,actor) do update set kind=excluded.kind,targets=excluded.targets;
 -- Rights are consumed at resolution, so changing a choice or a disconnect cannot spend them.
 perform vk_private.advance(r.id);
end $$;

create or replace function vk_private.resolve_shared_night(rid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r vk_private.rooms; c record; w vk_private.players; a vk_private.players; b vk_private.players; victim_row vk_private.players;
 swap_a uuid; swap_b uuid; cursed uuid; actor_id uuid; target_id uuid; protected_ids uuid[]:='{}'; attacks uuid[]:='{}';
 bite_target uuid; bite_actor uuid; guard_target uuid; guard_id uuid; deaths text[]:='{}'; attack_count int; i int; outcome text; kind_result text;
begin
 select * into r from vk_private.rooms where id=rid for update;
 if r.phase<>'night' or r.night_step<>'all' then return; end if;
 -- Invalid or departed choices become passes. No timeout ever invents an action.
 update vk_private.night_choices nc set kind='skip',targets='{}' where room_id=rid and round_number=r.round_number and seq=r.seq
 and (not exists(select 1 from vk_private.players np where np.id=nc.actor and vk_private.night_actor(r,np))
 or exists(select 1 from unnest(nc.targets) t where not exists(select 1 from vk_private.players p where p.id=t and p.room_id=rid and p.alive and p.participating and not p.kicked)));
 select p.* into w from vk_private.players p join vk_private.night_choices nc on nc.actor=p.id
 where nc.room_id=rid and nc.round_number=r.round_number and nc.seq=r.seq and nc.kind='swap' and p.role='wizard' and not p.wizard_used and p.alive;
 if found then
  select p.* into a from vk_private.players p where p.id=(select targets[1] from vk_private.night_choices where room_id=rid and round_number=r.round_number and seq=r.seq and actor=w.id);
  select p.* into b from vk_private.players p where p.id=(select targets[2] from vk_private.night_choices where room_id=rid and round_number=r.round_number and seq=r.seq and actor=w.id);
  swap_a:=a.id; swap_b:=b.id;
  update vk_private.players set wizard_used=true where id=w.id;
  if vk_private.faction(a.role)='vampire' or vk_private.faction(b.role)='vampire' then cursed:=w.id; end if;
  update vk_private.players set role=b.role,self_heal_used=b.self_heal_used,shot_used=b.shot_used,hunter_used=b.hunter_used,wizard_used=b.wizard_used,alpha_used=b.alpha_used,fanatic_target=b.fanatic_target where id=a.id;
  update vk_private.players set role=a.role,self_heal_used=a.self_heal_used,shot_used=a.shot_used,hunter_used=a.hunter_used,wizard_used=a.wizard_used,alpha_used=a.alpha_used,fanatic_target=a.fanatic_target where id=b.id;
  -- An inherited target must still be another person. A dead target remains a failed objective.
  update vk_private.players p set fanatic_target=(select q.id from vk_private.players q where q.room_id=rid and q.alive and q.participating and not q.kicked and q.id<>p.id order by random() limit 1)
   where p.id in (a.id,b.id) and p.role='fanatic' and p.fanatic_target=p.id;
  update vk_private.players set role_notices=role_notices||jsonb_build_array(jsonb_build_object('id',r.seq::text||':swap','kind','wizard','text','Büyülendin! Rolün değişti. Yeni rolünü ve kazanma koşulunu kontrol et.','role',role)) where id in (a.id,b.id);
  insert into vk_private.round_actions(room_id,round_number,seq,day,kind,actor,target,status,details)
   values(rid,r.round_number,r.seq,r.day,'swap',w.id,a.id,'resolved',jsonb_build_object('other_target',b.id,'cursed',cursed is not null));
 end if;
 -- Doctor, shaman and vampire choices were made with the old roles. Move both ends together.
 for c in select nc.* from vk_private.night_choices nc where room_id=rid and round_number=r.round_number and seq=r.seq and kind in ('protect','guard','silence') loop
  actor_id:=vk_private.swap_destination(c.actor,swap_a,swap_b); target_id:=vk_private.swap_destination(c.targets[1],swap_a,swap_b);
  if c.kind='protect' then
   protected_ids:=array_append(protected_ids,target_id);
   if actor_id=target_id then update vk_private.players set self_heal_used=true where id=actor_id; end if;
  elsif c.kind='guard' then guard_id:=actor_id; guard_target:=target_id;
  else update vk_private.players set muted_day=r.day+1 where id=target_id;
  end if;
  insert into vk_private.round_actions(room_id,round_number,seq,day,kind,actor,target,status)
   values(rid,r.round_number,r.seq,r.day,c.kind,actor_id,target_id,'resolved');
 end loop;
 select vk_private.swap_destination(nc.actor,swap_a,swap_b),vk_private.swap_destination(nc.targets[1],swap_a,swap_b)
 into bite_actor,bite_target from vk_private.night_choices nc where room_id=rid and round_number=r.round_number and seq=r.seq and kind='bite' limit 1;
 if bite_actor is not null then
  update vk_private.players set alpha_used=true where id=bite_actor;
  outcome:=case when bite_target=any(protected_ids) then 'saved' else 'converted' end;
  if outcome='converted' then
   -- Becoming a vampire abandons unearned independent objectives; earned personal wins persist.
   update vk_private.players set role='vampire',fanatic_target=null,role_notices=role_notices||jsonb_build_array(jsonb_build_object('id',r.seq::text||':bite','kind','alpha_vampire','text','Alfa vampir tarafından ısırılarak dönüştürüldün. Artık vampir takımındasın.','role','vampire')) where id=bite_target;
  end if;
  insert into vk_private.round_actions(room_id,round_number,seq,day,kind,actor,target,status,details)
   values(rid,r.round_number,r.seq,r.day,'bite',bite_actor,bite_target,'resolved',jsonb_build_object('outcome',outcome));
 else
  attack_count:=case when r.bonus_attacks=2 then 2 else 1 end;
  for i in 1..attack_count loop
   select dest into target_id from (
    select vk_private.swap_destination(nc.targets[i],swap_a,swap_b) dest from vk_private.night_choices nc
    where room_id=rid and round_number=r.round_number and seq=r.seq and kind='kill' and cardinality(targets)>=i
   ) proposals where not(dest=any(attacks)) order by random() limit 1;
   if target_id is null then continue; end if;
   attacks:=array_append(attacks,target_id);
   outcome:=case when target_id=any(protected_ids) then 'saved' when target_id=guard_target and guard_id is not null then 'guarded' else 'killed' end;
   insert into vk_private.round_actions(room_id,round_number,seq,day,kind,target,status,details)
    values(rid,r.round_number,r.seq,r.day,'kill',target_id,'resolved',jsonb_build_object('outcome',outcome,'proposals',(select jsonb_agg(jsonb_build_object('actor',vk_private.swap_destination(nc.actor,swap_a,swap_b),'target',vk_private.swap_destination(nc.targets[i],swap_a,swap_b))) from vk_private.night_choices nc where room_id=rid and round_number=r.round_number and seq=r.seq and kind='kill' and cardinality(targets)>=i)));
   if outcome='saved' then continue; end if;
   if outcome='guarded' then target_id:=guard_id; end if;
   select * into victim_row from vk_private.players where id=target_id and alive;
   if found then
    perform vk_private.apply_death(rid,victim_row.id,case when outcome='guarded' then 'bodyguard' else 'vampire' end);
    deaths:=array_append(deaths,format('#%s %s',victim_row.number,victim_row.name));
   end if;
  end loop;
 end if;
 if cursed is not null then
  select * into victim_row from vk_private.players where id=cursed and alive;
  if found then perform vk_private.apply_death(rid,victim_row.id,'magic'); deaths:=array_append(deaths,format('#%s %s',victim_row.number,victim_row.name)); end if;
 end if;
 update vk_private.round_actions set details=details||jsonb_build_object('outcome',
  case when kind='protect' and (target=any(attacks) or target=bite_target) then 'saved'
  when kind='guard' and target=any(attacks) and not(target=any(protected_ids)) then 'guarded' else 'missed' end)
 where room_id=rid and round_number=r.round_number and seq=r.seq and kind in ('protect','guard');
 kind_result:=case when cardinality(deaths)=0 then 'saved' else 'night_death' end;
 update vk_private.rooms set phase='night_result',night_step='resolve',bonus_attacks=0,tie_streak=0,seq=seq+1,started_at=now(),ends_at=now()+interval '7 seconds',
  announcement=jsonb_build_object('kind',kind_result,'text',case when cardinality(deaths)=0 then 'Günaydın köy! Bu gece kimse ölmedi.' else array_to_string(deaths,' ve ')||' bu gece köye veda etti.' end),
  events=events||jsonb_build_array(jsonb_build_object('day',r.day,'text',case when cardinality(deaths)=0 then 'Bu gece kimse ölmedi.' else array_to_string(deaths,' ve ')||' bu gece köye veda etti.' end)) where id=rid;
 perform vk_private.capture_hunter(rid);
 -- Give the result its full display interval; reconcile still settles victories on the next poll.
end $$;




create or replace function public.vk_ability(p_code text,p_seq int,p_action text,p_target uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=vk_private.require_user(); r vk_private.rooms; me vk_private.players; p vk_private.players; text_result text;
begin
 select * into r from vk_private.rooms where code=upper(btrim(p_code)) for update;
 if not found then raise exception 'Masa bulunamadı.'; end if;
 perform vk_private.advance(r.id);
 select * into r from vk_private.rooms where id=r.id;
 if r.seq is distinct from p_seq then raise exception 'Oyun yeni aşamaya geçti.'; end if;
 select * into me from vk_private.players where room_id=r.id and user_id=uid and participating and not kicked;
 if r.rules_version>=3 and r.phase='night' and p_action in ('guard','silence') then perform public.vk_night_action(p_code,p_seq,p_action,array[p_target]); return; end if;
 select * into p from vk_private.players where id=p_target and room_id=r.id and alive and participating and not kicked;
 if not found then raise exception 'Hayatta olan bir hedef seçmelisin.'; end if;
 if p_action='silence_breach' and r.host_id=uid and r.phase in ('day','runoff') and p.muted_day=r.day then
  perform vk_private.apply_death(r.id,p.id,'silence');
  text_result:=format('#%s %s sessizlik kuralını ihlal ettiği için elendi.',p.number,p.name);
 elsif p_action='revenge' and r.phase='hunter' and me.id=r.hunter_pending then
  perform vk_private.resolve_hunter(r.id,p.id); perform vk_private.reconcile(r.id); return;
 elsif me.id is null or not me.alive then raise exception 'Bu yeteneği kullanamazsın.';
 elsif p_action='shoot' and r.phase in ('intro','day','runoff') and me.role='gunslinger' and not me.shot_used and me.muted_day is distinct from r.day and p.id<>me.id then
  update vk_private.players set shot_used=true,guilt_day=case when p.role not in ('vampire','alpha_vampire','vampire_cub','jester','fanatic') then r.day+1 else null end where id=me.id;
  perform vk_private.apply_death(r.id,p.id,'gunslinger');
  text_result:=format('Silahşörün tek atışı #%s %s oyuncusunu oyun dışı bıraktı.',p.number,p.name);
 elsif p_action='decide' and r.phase='mayor_decision' and me.role='mayor' and p.id=any(r.vote_candidates) then
  perform vk_private.apply_death(r.id,p.id,'village');
  text_result:=format('Muhtarın kararıyla #%s %s idam edildi.',p.number,p.name);
  update vk_private.rooms set phase=case when p.role='jester' then 'finished' else 'execution' end,
   winner=case when p.role='jester' then 'jester' else null end,tie_streak=0,seq=seq+1,started_at=now(),ends_at=now()+interval '7 seconds',vote_candidates='{}' where id=r.id;
 elsif p_action='guard' and r.phase='night' and r.night_step='bodyguard' and me.role='bodyguard' and r.guard_target is null and p.id<>me.id then
  update vk_private.rooms set guard_target=p.id where id=r.id;
 elsif p_action='silence' and r.phase='night' and r.night_step='shaman' and me.role='shaman' and r.silence_target is null and p.id<>me.id then
  update vk_private.rooms set silence_target=p.id where id=r.id;
 else raise exception 'Bu aşamada bu yeteneği kullanamazsın.';
 end if;
 insert into vk_private.round_actions(room_id,round_number,seq,day,kind,actor,target,status)
 values(r.id,r.round_number,r.seq,r.day,p_action,me.id,p.id,case when p_action in ('guard','silence') then 'pending' else 'resolved' end);
 if text_result is not null then
  update vk_private.rooms set announcement=jsonb_build_object('kind',case p_action when 'shoot' then 'gunslinger' when 'decide' then 'mayor' else 'silence' end,'text',text_result),
   events=events||jsonb_build_array(jsonb_build_object('day',r.day,'text',text_result)) where id=r.id;
 end if;
 perform vk_private.capture_hunter(r.id);
 perform vk_private.advance(r.id);
end $$;


-- Room lock serializes joining, dealing, actions and timer transitions.
-- Timers use database time. No host browser or scheduled server is required.
create or replace function vk_private.reconcile(rid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r vk_private.rooms; p vk_private.players; changed boolean:=false; reset_night boolean:=false; living int; has_vampire boolean; town_count int;
begin
 perform vk_private.maintain_host(rid);
 select * into r from vk_private.rooms where id=rid for update;
 if not found or r.closed_at is not null or r.phase='finished' then return; end if;
 for p in select * from vk_private.players where room_id=rid and participating and alive and not kicked
  and last_seen<=now()-make_interval(secs=>coalesce((r.settings->>'disconnect_seconds')::int,60)) loop
  update vk_private.players set alive=false,ready=false,eliminated_by='disconnected',participating=(r.phase<>'lobby') where id=p.id;
  r.events:=r.events||jsonb_build_array(jsonb_build_object('day',r.day,'text',format('#%s %s bağlantı süresi dolduğu için elendi.',p.number,p.name)));
  changed:=true;
 end loop;
 if r.phase='lobby' then
  if changed then update vk_private.rooms set events=r.events where id=rid; end if;
  return;
 end if;
 -- Keep tied candidates restricted even when someone departs. With one candidate,
 -- that candidate is excused from voting (self-votes remain forbidden).
 if cardinality(r.vote_candidates)>0 then
  select coalesce(array_agg(id order by number),'{}'::uuid[]) into r.vote_candidates from vk_private.players
   where room_id=rid and id=any(r.vote_candidates) and alive and participating and not kicked;
  update vk_private.rooms set vote_candidates=r.vote_candidates where id=rid;
 end if;
 update vk_private.round_actions a set status='cancelled' where a.room_id=rid and a.round_number=r.round_number and a.seq=r.seq and a.kind='vote' and a.status='pending' and
  (not exists(select 1 from vk_private.players where id=a.actor and alive and participating and not kicked)
   or not exists(select 1 from vk_private.players where id=a.target and alive and participating and not kicked)
   or (cardinality(r.vote_candidates)>0 and not (a.target=any(r.vote_candidates))));
 -- Invalid ballots are released so remaining voters can choose a living target.
 delete from vk_private.votes v where v.room_id=rid and v.seq=r.seq and
  (not exists(select 1 from vk_private.players where id=v.voter and alive and participating and not kicked)
   or not exists(select 1 from vk_private.players where id=v.target and alive and participating and not kicked)
   or (cardinality(r.vote_candidates)>0 and not (v.target=any(r.vote_candidates))));
 delete from vk_private.early_votes v where v.room_id=rid and v.seq=r.seq and
  not exists(select 1 from vk_private.players where id=v.voter and alive and participating and not kicked);
 -- Invalidate only newly abandoned helper actions. Refunding all historical
 -- cancellations would accidentally reopen a doctor's already-reused self-save.
 with invalidated as (
  update vk_private.round_actions a set status='cancelled' where a.room_id=rid and a.round_number=r.round_number and a.day=r.day
   and a.kind in ('protect','guard','silence') and a.status='pending'
   and (not exists(select 1 from vk_private.players where id=a.actor and alive and participating and not kicked)
     or not exists(select 1 from vk_private.players where id=a.target and alive and participating and not kicked))
   returning kind,actor,target
 ) update vk_private.players set self_heal_used=false where id in (select actor from invalidated where kind='protect' and actor=target);

 delete from vk_private.vampire_choices c where c.room_id=rid and c.seq=r.seq and
  (not exists(select 1 from vk_private.players where id=c.actor and alive and participating and not kicked and vk_private.can_hunt(rid,id))
   or not exists(select 1 from vk_private.players where id=c.target and alive and participating and not kicked));
 select count(*),coalesce(bool_or(role in ('vampire','alpha_vampire','vampire_cub')),false),count(*) filter (where role not in ('vampire','alpha_vampire','vampire_cub')) into living,has_vampire,town_count from vk_private.players where room_id=rid and participating and alive and not kicked;
 if r.hunter_pending is not null and living=0 then
  update vk_private.players set hunter_used=true where id=r.hunter_pending;
  r.hunter_pending:=null;
  update vk_private.rooms set hunter_pending=null,hunter_resume=null where id=rid;
 end if;
 if r.hunter_pending is null and (not has_vampire or town_count=0 or living<=2 or (r.phase='night' and living<=3)) then
  update vk_private.rooms set phase='finished',winner=case when has_vampire then 'vampire' else 'village' end,
   seq=seq+1,ends_at=now(),announcement=null,events=r.events where id=rid;
  return;
 end if;
 if r.rules_version<3 and r.phase='night' and ((r.victim is not null and not exists(select 1 from vk_private.players where id=r.victim and alive and participating and not kicked)) or (r.extra_victim is not null and not exists(select 1 from vk_private.players where id=r.extra_victim and alive and participating and not kicked))) then
  -- A cancelled, unresolved protection must not consume the doctor's only self-save.
  update vk_private.players set self_heal_used=false where id=r.protected and role='doctor';
  update vk_private.round_actions set status='cancelled' where room_id=rid and round_number=r.round_number and day=r.day and kind in ('kill','protect','guard','silence') and status='pending';
  delete from vk_private.vampire_choices where room_id=rid and seq=r.seq;
  r.victim:=null; r.extra_victim:=null; r.protected:=null; r.guard_target:=null; r.silence_target:=null; r.night_step:='vampire';
  r.ends_at:=now()+make_interval(secs=>(r.settings->>'night_seconds')::int);
  changed:=true; reset_night:=true;
 end if;
 if r.phase='night' then
  if r.protected is not null and (not exists(select 1 from vk_private.players where room_id=rid and role='doctor' and alive and participating and not kicked) or not exists(select 1 from vk_private.players where id=r.protected and alive and participating and not kicked)) then r.protected:=null; changed:=true; end if;
  if r.guard_target is not null and (not exists(select 1 from vk_private.players where room_id=rid and role='bodyguard' and alive and participating and not kicked) or not exists(select 1 from vk_private.players where id=r.guard_target and alive and participating and not kicked)) then r.guard_target:=null; changed:=true; end if;
  if r.silence_target is not null and (not exists(select 1 from vk_private.players where room_id=rid and role='shaman' and alive and participating and not kicked) or not exists(select 1 from vk_private.players where id=r.silence_target and alive and participating and not kicked)) then r.silence_target:=null; changed:=true; end if;
 end if;
 if changed then
  update vk_private.rooms set events=r.events,victim=r.victim,extra_victim=r.extra_victim,protected=r.protected,guard_target=r.guard_target,silence_target=r.silence_target,night_step=r.night_step,ends_at=r.ends_at,
   started_at=case when reset_night then now() else started_at end,
   announcement=jsonb_build_object('kind','departure','text','Bağlantı süresi dolan oyuncu elendi. Kalan oyuncularla devam ediliyor; seçimlerini kontrol et.') where id=rid;
 end if;
end $$;

create or replace function vk_private.advance(rid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r vk_private.rooms; alive_count int; votes_count int; needed int;
 target_id uuid; leaders uuid[]; p vk_private.players; night_next boolean := false; dur int; jumped int; required_voters int;
begin
 perform vk_private.reconcile(rid);
 select * into r from vk_private.rooms where id=rid for update;
 if not found or r.closed_at is not null or r.phase in ('lobby','finished') then return; end if;
 select count(*) into alive_count from vk_private.players where room_id=rid and alive;
 needed := alive_count/2+1;
 if r.rules_version>=3 and r.phase='night' then
  if now()>=r.night_base_ends_at and (now()>=r.ends_at or not exists(
   select 1 from vk_private.players np where vk_private.night_actor(r,np) and not exists(
    select 1 from vk_private.night_choices nc where nc.room_id=rid and nc.round_number=r.round_number and nc.seq=r.seq and nc.actor=np.id)
  )) then perform vk_private.resolve_shared_night(rid); end if;
  return;
 end if;
 -- Speaking turns share the phase's clock; they never reset ballots or early requests.
 if r.phase in ('intro','day') and coalesce((r.settings->>'turn_based')::boolean,false)
    and r.speech_turn < cardinality(r.speech_order)*2 and r.speech_ends_at<=now() then
  jumped:=least(cardinality(r.speech_order)*2-r.speech_turn,
   floor(extract(epoch from (now()-r.speech_ends_at))*1000/greatest(r.speech_slot_ms,1))::int+1);
  if r.speech_turn+jumped>=cardinality(r.speech_order)*2 then
   r.ends_at:=r.speech_ends_at+make_interval(secs=>(jumped-1)*r.speech_slot_ms/1000.0+(r.settings->>'day_seconds')::int);
  end if;
  r.speech_turn:=r.speech_turn+jumped;
  r.speech_ends_at:=case when r.speech_turn<cardinality(r.speech_order)*2
   then r.speech_ends_at+make_interval(secs=>jumped*r.speech_slot_ms/1000.0) else null end;
  update vk_private.rooms set speech_turn=r.speech_turn,speech_ends_at=r.speech_ends_at,ends_at=r.ends_at where id=rid;
 end if;
 if r.phase in ('intro','day') and coalesce((r.settings->>'turn_based')::boolean,false) then
  while r.speech_turn<cardinality(r.speech_order)*2 and not exists(select 1 from vk_private.players where id=r.speech_order[r.speech_turn%cardinality(r.speech_order)+1] and alive and participating and not kicked and muted_day is distinct from r.day) loop
   r.speech_turn:=r.speech_turn+1;
   r.ends_at:=now()+make_interval(secs=>(cardinality(r.speech_order)*2-r.speech_turn)*r.speech_slot_ms/1000.0+(r.settings->>'day_seconds')::int);
   r.speech_ends_at:=case when r.speech_turn<cardinality(r.speech_order)*2 then now()+make_interval(secs=>r.speech_slot_ms/1000.0) else null end;
  end loop;
  update vk_private.rooms set speech_turn=r.speech_turn,speech_ends_at=r.speech_ends_at,ends_at=r.ends_at where id=rid;
 end if;
 if r.phase in ('intro','day','runoff') then
  select count(*) into votes_count from vk_private.early_votes where room_id=rid and seq=r.seq;
  if now()<r.ends_at and votes_count<needed then return; end if;
 elsif now()<r.ends_at then return;
 end if;

 case r.phase
 when 'dealing' then r.phase:='countdown'; dur:=5;
 when 'countdown' then r.phase:='intro'; dur:=(r.settings->>'day_seconds')::int;
 when 'intro' then night_next:=true;
 when 'day' then r.phase:='voting'; dur:=(r.settings->>'vote_seconds')::int;
 when 'runoff' then r.phase:='voting'; dur:=(r.settings->>'vote_seconds')::int;
 when 'hunter' then
  select id into target_id from vk_private.players where room_id=rid and alive and participating and not kicked order by random() limit 1;
  if target_id is not null then perform vk_private.resolve_hunter(rid,target_id,true); end if;
  perform vk_private.reconcile(rid); return;
 when 'mayor_decision' then
  r.phase:='runoff'; dur:=(r.settings->>'runoff_seconds')::int;
  r.announcement:=jsonb_build_object('kind','tie','text','Muhtar karar vermedi. Eşit adaylarla ek tartışma ve oylama yapılacak.');
 when 'night' then
  if r.night_step in ('vampire','vampire_extra') then
   if coalesce((r.settings->>'two_vampires')::boolean,false) then
    select count(*) into votes_count from vk_private.vampire_choices where room_id=rid and seq=r.seq;
    select count(*) into required_voters from vk_private.players where room_id=rid and vk_private.can_hunt(rid,id);
    select target into target_id from vk_private.vampire_choices where room_id=rid and seq=r.seq order by random() limit 1;
    if target_id is null then
     select id into target_id from vk_private.players where room_id=rid and alive and participating and not kicked and role not in ('vampire','alpha_vampire','vampire_cub')
      and (r.night_step<>'vampire_extra' or id is distinct from r.victim) order by random() limit 1;
     insert into vk_private.round_actions(room_id,round_number,seq,day,kind,target,status,details)
      values(rid,r.round_number,r.seq,r.day,'kill',target_id,'pending',jsonb_build_object('automatic',true));
    end if;
    if r.night_step='vampire' then r.victim:=target_id; else r.extra_victim:=target_id; end if;
    r.vampire_decision:=jsonb_build_object('target',target_id,'random',
      votes_count=0 or (select count(distinct target)>1 from vk_private.vampire_choices where room_id=rid and seq=r.seq),'automatic',votes_count<required_voters);
   end if;
   if (r.night_step='vampire' and r.victim is null) or (r.night_step='vampire_extra' and r.extra_victim is null) then return; end if;
   if r.night_step='vampire' and r.bonus_attacks=2 then r.night_step:='vampire_extra'; dur:=(r.settings->>'night_seconds')::int;
   else r.night_step:=vk_private.next_night_step(r,r.night_step); dur:=(r.settings->>'night_seconds')::int; end if;
  elsif r.night_step in ('doctor','bodyguard','shaman') then
   if exists(select 1 from vk_private.players where room_id=rid and alive and participating and not kicked and role=r.night_step) and
    ((r.night_step='doctor' and r.protected is null) or (r.night_step='bodyguard' and r.guard_target is null) or (r.night_step='shaman' and r.silence_target is null)) then return; end if;
   r.night_step:=vk_private.next_night_step(r,r.night_step); dur:=(r.settings->>'night_seconds')::int;
  end if;
  if r.night_step='resolve' then
   update vk_private.rooms set victim=r.victim,extra_victim=r.extra_victim,protected=r.protected,guard_target=r.guard_target,silence_target=r.silence_target,bonus_attacks=0 where id=rid;
   perform vk_private.resolve_night(rid);
   select announcement,events into r.announcement,r.events from vk_private.rooms where id=rid;
   r.bonus_attacks:=0;
   r.phase:='night_result'; dur:=7;
  end if;
 when 'night_result' then
  for p in select * from vk_private.players where room_id=rid and alive and guilt_day<=r.day+1 loop
   perform vk_private.apply_death(rid,p.id,'guilt');
   r.announcement:=jsonb_build_object('kind','guilt','text',format('#%s %s yanlış atışının bedeliyle köye veda etti.',p.number,p.name));
   r.events:=r.events||jsonb_build_array(jsonb_build_object('day',r.day+1,'text',r.announcement->>'text'));
  end loop;
  r.day:=r.day+1; r.phase:='day'; dur:=(r.settings->>'day_seconds')::int;
 when 'voting' then
  select count(*) into votes_count from vk_private.votes where room_id=rid and seq=r.seq;
  required_voters:=alive_count-case when cardinality(r.vote_candidates)=1 then 1 else 0 end;
  if votes_count<required_voters then return; end if;
  -- Only first-place ties advance. The strict majority above is solely for early transitions.
  with totals as (
   select v.target,sum(case when vp.role='mayor' then 2 else 1 end) n from vk_private.votes v join vk_private.players vp on vp.id=v.voter where v.room_id=rid and v.seq=r.seq group by v.target
  ) select array_agg(target order by target) into leaders from totals where n=(select max(n) from totals);
  target_id:=case when cardinality(leaders)=1 then leaders[1] else null end;
  update vk_private.round_actions set status='counted' where room_id=rid and round_number=r.round_number and seq=r.seq and kind='vote' and status='pending';
  insert into vk_private.round_actions(room_id,round_number,seq,day,kind,target,status,details)
   values(rid,r.round_number,r.seq,r.day,'vote_result',target_id,case when target_id is null then 'tie' else 'execution' end,
    jsonb_build_object('candidates',coalesce(leaders,'{}'::uuid[])));
  if target_id is null then
   r.vote_candidates:=coalesce(leaders,'{}'::uuid[]);
   if r.rules_version>=3 then r.tie_streak:=r.tie_streak+1; end if;
   r.phase:=case when exists(select 1 from vk_private.players where room_id=rid and alive and participating and not kicked and role='mayor') then 'mayor_decision' else 'runoff' end; dur:=case when r.phase='mayor_decision' then 30 else (r.settings->>'runoff_seconds')::int end;
   r.announcement:=jsonb_build_object('kind','tie','text','En yüksek oyda eşitlik var. Biraz daha konuşalım; ardından yalnızca birincilikte eşit kalan adaylar oylanacak.');
   if r.rules_version>=3 and r.tie_streak>=2 then
    r.phase:='nightfall'; dur:=7;
    r.announcement:=jsonb_build_object('kind','second_tie','text','İkinci kez eşitlik! Bu oylama bitti. Kimse idam edilmeden geceye geçiliyor.');
   end if;
   r.events:=r.events||jsonb_build_array(jsonb_build_object('day',r.day,'text',r.announcement->>'text'));
  else
   r.tie_streak:=0;
   perform vk_private.apply_death(rid,target_id,'village');
   select * into p from vk_private.players where id=target_id;
   select bonus_attacks into r.bonus_attacks from vk_private.rooms where id=rid;
   r.announcement:=jsonb_build_object('kind','execution','number',p.number,'name',p.name,'text',format('%s · %s köyün kararıyla idam edildi.',p.number,p.name));
   r.events:=r.events||jsonb_build_array(jsonb_build_object('day',r.day,'text',r.announcement->>'text'));
   if p.role='jester' then r.phase:='finished'; r.winner:='jester'; dur:=0;
   elsif p.role in ('vampire','alpha_vampire','vampire_cub') and not exists(select 1 from vk_private.players where room_id=rid and role in ('vampire','alpha_vampire','vampire_cub') and alive and participating and not kicked) then r.phase:='finished'; r.winner:='village'; dur:=0;
   else r.phase:='execution'; dur:=7;
   end if;
  end if;
 when 'execution' then night_next:=true;
 when 'nightfall' then night_next:=true;
 else return;
 end case;

 if r.phase not in ('runoff','voting','mayor_decision') then r.vote_candidates:='{}'; end if;
 if night_next then
  select count(*) into alive_count from vk_private.players where room_id=rid and alive;
  if alive_count<=3 then r.phase:='finished'; r.winner:='vampire'; dur:=0;
  else
   r.phase:='night'; r.night_step:='vampire'; r.victim:=null; r.protected:=null; r.vampire_decision:=null; r.extra_victim:=null; r.guard_target:=null; r.silence_target:=null;
   select bonus_attacks into r.bonus_attacks from vk_private.rooms where id=rid;
   dur:=(r.settings->>'night_seconds')::int;
   if r.rules_version>=3 then
    r.night_step:='all'; r.tie_streak:=0;
    r.night_base_ends_at:=now()+make_interval(secs=>dur);
    dur:=dur+coalesce((r.settings->>'night_grace_seconds')::int,10);
   end if;
  end if;
 end if;
 if r.phase in ('intro','day') and coalesce((r.settings->>'turn_based')::boolean,false) then
  select array_agg(id order by random()) into r.speech_order from vk_private.players where room_id=rid and alive and participating and not kicked and muted_day is distinct from r.day;
  r.speech_turn:=0;
  r.speech_slot_ms:=coalesce((r.settings->>'turn_seconds')::int,30)*1000;
  dur:=dur+cardinality(r.speech_order)*2*r.speech_slot_ms/1000;
  r.speech_ends_at:=now()+make_interval(secs=>r.speech_slot_ms/1000.0);
 end if;
 update vk_private.rooms set phase=r.phase,seq=r.seq+1,day=r.day,started_at=now(),
  ends_at=now()+make_interval(secs=>dur),night_step=r.night_step,victim=r.victim,protected=r.protected,
  extra_victim=r.extra_victim,guard_target=r.guard_target,silence_target=r.silence_target,bonus_attacks=r.bonus_attacks,
  winner=r.winner,announcement=r.announcement,events=r.events,vote_candidates=r.vote_candidates,vampire_decision=r.vampire_decision,
  tie_streak=r.tie_streak,night_base_ends_at=r.night_base_ends_at,
  speech_order=r.speech_order,speech_turn=r.speech_turn,speech_slot_ms=r.speech_slot_ms,speech_ends_at=r.speech_ends_at where id=rid;
 perform vk_private.capture_hunter(rid);
end $$;

create or replace function vk_private.room_quota(uid uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare used int; next_at timestamptz;
begin
 select count(*) into used from vk_private.rooms where creator_id=uid and created_at>now()-interval '1 hour';
 select created_at+interval '1 hour' into next_at from vk_private.rooms
  where creator_id=uid and created_at>now()-interval '1 hour'
  order by created_at offset greatest(used-10,0) limit 1;
 return jsonb_build_object('limit',10,'used',used,'remaining',greatest(0,10-used),
  'next_refresh_at',next_at,'server_now',now());
end $$;

create or replace function public.vk_quota() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
 return vk_private.room_quota(vk_private.require_user());
end $$;

create or replace function vk_private.create_room(p_name text,p_settings jsonb,p_pin text) returns text
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=vk_private.require_user(); rid uuid; c text; cfg jsonb;
begin
 cfg:=vk_private.settings(p_settings)||jsonb_build_object('bodyguard','never');
 if (cfg->>'random_theme')::boolean then cfg:=jsonb_set(cfg,'{theme}',to_jsonb((array['classic','lavender','forest','peach','ocean','sunset','moonlight'])[1+floor(random()*7)::int])); end if;
 if (cfg->>'pin_enabled')::boolean and (p_pin is null or p_pin !~ '^[0-9]{4}$') then raise exception 'Masa şifresi tam 4 rakam olmalı.'; end if;
 if (cfg->>'host_plays')::boolean and (p_name is null or char_length(btrim(p_name)) not between 1 and 20) then raise exception 'İsmin 1–20 karakter olmalı.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 if (vk_private.room_quota(uid)->>'remaining')::int=0 then raise exception 'Son 1 saatte 10 masa açtın. Bir hakkın yenilenince yeniden masa kurabilirsin.'; end if;
 loop
  c:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  begin
   insert into vk_private.rooms(code,host_id,creator_id,rules_version,observer_ids,settings) values(c,uid,uid,3,case when (cfg->>'host_plays')::boolean then '{}'::uuid[] else array[uid] end,cfg) returning id into rid; exit;
  exception when unique_violation then null; end;
 end loop;
 if (cfg->>'pin_enabled')::boolean then update vk_private.rooms set pin_hash=encode(sha256(convert_to(rid::text||':'||p_pin,'UTF8')),'hex') where id=rid; end if;
 if (cfg->>'host_plays')::boolean then insert into vk_private.players(room_id,user_id,number,name) values(rid,uid,1,btrim(p_name)); end if;
 return c;
end $$;

create or replace function public.vk_create(p_name text, p_settings jsonb default '{}') returns text
language plpgsql security definer set search_path = '' as $$
begin return vk_private.create_room(p_name,p_settings,null); end $$;

create or replace function public.vk_create(p_name text,p_settings jsonb,p_pin text) returns text
language plpgsql security definer set search_path = '' as $$
begin return vk_private.create_room(p_name,p_settings,p_pin); end $$;

create or replace function vk_private.enroll(r vk_private.rooms,p_name text) returns text
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=vk_private.require_user(); num int; member vk_private.players;
begin
 select * into member from vk_private.players where room_id=r.id and user_id=uid;
 if found then
  if member.kicked then raise exception using errcode='VK001',message='Bu masadan çıkarıldın.'; end if;
  return r.code;
 end if;
 if uid=any(r.observer_ids) then return r.code; end if;
 if r.closed_at is not null then raise exception using errcode='VK002',message='Bu masa kapatıldı.'; end if;
 if r.created_at<now()-interval '24 hours' then raise exception 'Bu masanın süresi dolmuş. Yeni bir masa kurun.'; end if;
 if r.phase<>'lobby' then raise exception 'Oyun başladı; artık bu masaya katılamazsın.'; end if;
 if p_name is null or char_length(btrim(p_name)) not between 1 and 20 then raise exception 'İsmin 1–20 karakter olmalı.'; end if;
 perform vk_private.reconcile(r.id);
 if (select count(*) from vk_private.players where room_id=r.id and participating and not kicked)>=24 then raise exception 'Masa dolu! En fazla 24 kişi katılabilir.'; end if;
 select coalesce(max(number),0)+1 into num from vk_private.players where room_id=r.id;
 insert into vk_private.players(room_id,user_id,number,name) values(r.id,uid,num,btrim(p_name));
 return r.code;
end $$;

-- Legacy callers cannot bypass a protected room. Existing members keep their seat.
create or replace function public.vk_join(p_code text,p_name text) returns text
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=vk_private.require_user(); r vk_private.rooms;
begin
 select * into r from vk_private.rooms where code=upper(btrim(p_code)) for update;
 if not found then raise exception 'Bu kodla bir masa bulunamadı.'; end if;
 if r.closed_at is not null then raise exception using errcode='VK002',message='Bu masa kapatıldı.'; end if;
 if r.pin_hash is not null and r.host_id<>uid and not (uid=any(r.observer_ids)) and not exists(select 1 from vk_private.players where room_id=r.id and user_id=uid) then raise exception 'Bu masa şifreli. Sayfayı yenileyip masa şifresiyle katıl.'; end if;
 return vk_private.enroll(r,p_name);
end $$;

-- Failed guesses return data so the attempt counter is committed, not rolled back.
create or replace function public.vk_enter(p_code text,p_name text,p_pin text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=vk_private.require_user(); r vk_private.rooms; attempt vk_private.join_attempts;
begin
 select * into r from vk_private.rooms where code=upper(btrim(p_code)) for update;
 if not found then raise exception 'Bu kodla bir masa bulunamadı.'; end if;
 if r.closed_at is not null then raise exception using errcode='VK002',message='Bu masa kapatıldı.'; end if;
 if r.host_id=uid or uid=any(r.observer_ids) or exists(select 1 from vk_private.players where room_id=r.id and user_id=uid) then
  return jsonb_build_object('code',vk_private.enroll(r,p_name));
 end if;
 if r.pin_hash is not null then
  insert into vk_private.join_attempts(room_id,user_id) values(r.id,uid) on conflict do nothing;
  select * into attempt from vk_private.join_attempts where room_id=r.id and user_id=uid for update;
  if attempt.locked_until>now() then return jsonb_build_object('error','Çok fazla hatalı şifre. 5 dakika sonra tekrar dene.','retry_after',attempt.locked_until); end if;
  if attempt.window_start<=now()-interval '5 minutes' then attempt.failures:=0; attempt.window_start:=now(); end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' or encode(sha256(convert_to(r.id::text||':'||p_pin,'UTF8')),'hex')<>r.pin_hash then
   update vk_private.join_attempts set failures=attempt.failures+1,window_start=attempt.window_start,
    locked_until=case when attempt.failures+1>=5 then now()+interval '5 minutes' else null end where room_id=r.id and user_id=uid;
   return jsonb_build_object('error',case when attempt.failures+1>=5 then 'Çok fazla hatalı şifre. 5 dakika sonra tekrar dene.' else 'Masa şifresi yanlış. 4 haneli şifreyi kontrol et.' end);
  end if;
 end if;
 delete from vk_private.join_attempts where room_id=r.id and user_id=uid;
 return jsonb_build_object('code',vk_private.enroll(r,p_name));
end $$;

create or replace function public.vk_ready(p_code text,p_seq int,p_ready boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=vk_private.require_user(); r vk_private.rooms;
begin
 select * into r from vk_private.rooms where code=upper(btrim(p_code)) for update;
 if not found then raise exception 'Masa bulunamadı.'; end if;
 if exists(select 1 from vk_private.players where room_id=r.id and user_id=uid and kicked) then raise exception using errcode='VK001',message='Bu masadan çıkarıldın.'; end if;
 perform vk_private.advance(r.id);
 select * into r from vk_private.rooms where id=r.id;
 if not exists(select 1 from vk_private.players where room_id=r.id and user_id=uid and participating and alive and not kicked) then
  raise exception 'Hazır durumunu yalnızca masadaki oyuncular değiştirebilir.';
 end if;
 if r.phase<>'lobby' or r.seq is distinct from p_seq then raise exception 'Masa yeni aşamaya geçti. Ekran güncelleniyor.'; end if;
 if p_ready is null then raise exception 'Hazır durumunu belirtmelisin.'; end if;
 update vk_private.players set ready=p_ready,last_seen=now() where room_id=r.id and user_id=uid;
end $$;

create or replace function public.vk_update_lobby(p_code text,p_seq int,p_settings jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=vk_private.require_user(); r vk_private.rooms; cfg jsonb;
begin
 select * into r from vk_private.rooms where code=upper(btrim(p_code)) for update;
 if not found then raise exception 'Masa bulunamadı.'; end if;
 perform vk_private.maintain_host(r.id);
 select * into r from vk_private.rooms where id=r.id;
 if r.host_id<>uid then raise exception 'Ayarları yalnızca masa sahibi değiştirebilir.'; end if;
 if r.phase<>'lobby' or r.seq is distinct from p_seq then raise exception 'Ayarlar yalnızca oyun başlamadan değiştirilebilir.'; end if;
 cfg:=vk_private.settings(p_settings || jsonb_build_object('host_plays',r.settings->'host_plays','pin_enabled',r.settings->'pin_enabled'))||jsonb_build_object('bodyguard','never');
 if (cfg->>'random_theme')::boolean then
  cfg:=jsonb_set(cfg,'{theme}',to_jsonb((select theme from unnest(array['classic','lavender','forest','peach','ocean','sunset','moonlight']) theme where theme<>r.settings->>'theme' order by random() limit 1)));
 end if;
 update vk_private.rooms set settings=cfg where id=r.id;
 update vk_private.players set ready=false where room_id=r.id and not kicked;
end $$;

create or replace function public.vk_rename(p_code text,p_seq int,p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=vk_private.require_user(); r vk_private.rooms;
begin
 select * into r from vk_private.rooms where code=upper(btrim(p_code)) for update;
 if not found or r.phase<>'lobby' or r.seq is distinct from p_seq then raise exception 'İsim yalnızca oyun başlamadan değiştirilebilir.'; end if;
 if p_name is null or char_length(btrim(p_name)) not between 1 and 20 then raise exception 'İsmin 1–20 karakter olmalı.'; end if;
 update vk_private.players set name=btrim(p_name),ready=false,last_seen=now() where room_id=r.id and user_id=uid and (participating or spectator) and not kicked;
 if not found then raise exception 'Yalnızca masadaki kişiler isim değiştirebilir.'; end if;
end $$;

create or replace function vk_private.reset_lobby(rid uuid,reshuffle_theme boolean default true,notice text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare r vk_private.rooms;
begin
 select * into r from vk_private.rooms where id=rid for update;
 update vk_private.players set wizard_used=false,alpha_used=false,fanatic_target=null,fanatic_won=false,fanatic_won_target=null,role_notices='[]',muted_day=null,shot_used=false,guilt_day=null,hunter_used=false,
  role='villager',alive=not kicked and not spectator,participating=not kicked and not spectator,self_heal_used=false,eliminated_by=case when kicked then 'kicked' else null end,ready=false where room_id=rid;
 update vk_private.rooms set rules_version=3,tie_streak=0,night_base_ends_at=null,
  settings=(case when reshuffle_theme and coalesce((settings->>'random_theme')::boolean,false) then jsonb_set(settings,'{theme}',to_jsonb((select theme from unnest(array['classic','lavender','forest','peach','ocean','sunset','moonlight']) theme where theme<>r.settings->>'theme' order by random() limit 1))) else settings end)||jsonb_build_object('bodyguard','never'),
  phase='lobby',seq=seq+1,round_number=round_number+1,day=1,started_at=now(),ends_at=null,night_step=null,victim=null,protected=null,winner=null,
  announcement=case when notice is null then null else jsonb_build_object('kind','departure','text',notice) end,events='[]',
  speech_order='{}',speech_turn=0,speech_slot_ms=0,speech_ends_at=null,vote_candidates='{}',summary_complete=false,vampire_decision=null,
  extra_victim=null,guard_target=null,silence_target=null,bonus_attacks=0,hunter_pending=null,hunter_resume=null where id=rid;
 delete from vk_private.voice_signals where room_id=rid;
 delete from vk_private.voice_peers where room_id=rid;
end $$;

create or replace function public.vk_set_spectator(p_code text,p_seq int,p_target uuid,p_spectator boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=vk_private.require_user(); r vk_private.rooms; p vk_private.players;
begin
 select * into r from vk_private.rooms where code=upper(btrim(p_code)) for update;
 if not found then raise exception 'Masa bulunamadı.'; end if;
 if r.closed_at is not null then raise exception using errcode='VK002',message='Bu masa kapatıldı.'; end if;
 perform vk_private.maintain_host(r.id);
 select * into r from vk_private.rooms where id=r.id;
 if r.phase<>'lobby' or r.seq is distinct from p_seq then raise exception 'İzleyici seçimi yalnızca oyun başlamadan değiştirilebilir.'; end if;
 if p_spectator is null then raise exception 'İzleyici durumunu belirtmelisin.'; end if;
 select * into p from vk_private.players where id=p_target and room_id=r.id and not kicked and (participating or spectator);
 if not found then raise exception 'Masadaki bir kişiyi seçmelisin.'; end if;
 if p.user_id<>uid and r.host_id<>uid then raise exception 'Yalnızca kendi seçimini veya masa sahibi olarak başkasının seçimini değiştirebilirsin.'; end if;
 if p.spectator=p_spectator then return; end if;
 if not p_spectator and (select count(*) from vk_private.players where room_id=r.id and participating and not kicked)>=24 then raise exception 'Oyuncu koltukları dolu. En fazla 24 kişi oynayabilir.'; end if;
 if p_spectator and (select count(*) from vk_private.players where room_id=r.id and spectator and not kicked)>=24 then raise exception 'En fazla 24 izleyici olabilir.'; end if;
 update vk_private.players set spectator=p_spectator,participating=not p_spectator,alive=not p_spectator,ready=false,role='villager',eliminated_by=null where id=p.id;
 -- Any roster change invalidates the old ready consensus.
 update vk_private.players set ready=false where room_id=r.id and not kicked;
end $$;

create or replace function public.vk_return_lobby(p_code text,p_seq int) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=vk_private.require_user(); r vk_private.rooms;
begin
 select * into r from vk_private.rooms where code=upper(btrim(p_code)) for update;
 if not found then raise exception 'Masa bulunamadı.'; end if;
 if r.closed_at is not null then raise exception using errcode='VK002',message='Bu masa kapatıldı.'; end if;
 perform vk_private.maintain_host(r.id);
 select * into r from vk_private.rooms where id=r.id;
 if r.host_id<>uid then raise exception 'Oyunu yalnızca masa sahibi durdurabilir.'; end if;
 if r.phase='lobby' and r.seq=p_seq+1 then return; end if;
 if r.phase='lobby' or r.seq is distinct from p_seq then raise exception 'Oyun aşaması değişti. Ekranı yenile.'; end if;
 perform vk_private.reset_lobby(r.id,false,'Oyun masa sahibi tarafından durduruldu. Herkes bekleme odasında; yeniden hazır olabilirsiniz.');
end $$;

create or replace function public.vk_close_room(p_code text,p_seq int) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=vk_private.require_user(); r vk_private.rooms;
begin
 select * into r from vk_private.rooms where code=upper(btrim(p_code)) for update;
 if not found then raise exception 'Masa bulunamadı.'; end if;
 if r.closed_at is not null then
  if r.host_id=uid then return; end if;
  raise exception using errcode='VK002',message='Bu masa kapatıldı.';
 end if;
 perform vk_private.maintain_host(r.id);
 select * into r from vk_private.rooms where id=r.id;
 if r.host_id<>uid then raise exception 'Masayı yalnızca masa sahibi kapatabilir.'; end if;
 if r.phase<>'lobby' or r.seq is distinct from p_seq then raise exception 'Masayı kapatmadan önce oyunu durdurup bekleme odasına dön.'; end if;
 update vk_private.rooms set closed_at=now(),phase='closed',seq=seq+1,ends_at=null,speech_ends_at=null where id=r.id;
 delete from vk_private.voice_signals where room_id=r.id;
 delete from vk_private.voice_peers where room_id=r.id;
end $$;

create or replace function public.vk_rematch(p_code text,p_seq int) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=vk_private.require_user(); r vk_private.rooms;
begin
 select * into r from vk_private.rooms where code=upper(btrim(p_code)) for update;
 if not found then raise exception 'Masa bulunamadı.'; end if;
 perform vk_private.maintain_host(r.id);
 select * into r from vk_private.rooms where id=r.id;
 if r.host_id<>uid then raise exception 'Rövanşı yalnızca masa sahibi açabilir.'; end if;
 -- A repeated tap must not clear players who have already readied for the rematch.
 if r.phase='lobby' and r.round_number>1 and r.seq=p_seq+1 then return; end if;
 if r.phase<>'finished' or r.seq is distinct from p_seq then raise exception 'Rövanş yalnızca oyun bittikten sonra açılabilir.'; end if;
 perform vk_private.reset_lobby(r.id);
end $$;

create or replace function public.vk_start(p_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=vk_private.require_user(); r vk_private.rooms; ids uuid[];
 idx int:=2; k text; mandatory int; drawn text[]; cfg jsonb; options text[]:=array['doctor','jester','mayor','hunter','shaman','gunslinger','vampire_cub','wizard','fanatic'];
begin
 select * into r from vk_private.rooms where code=upper(btrim(p_code)) for update;
 if not found then raise exception 'Masa bulunamadı.'; end if;
 perform vk_private.advance(r.id);
 select * into r from vk_private.rooms where id=r.id;
 if r.host_id<>uid then raise exception 'Oyunu yalnızca masa sahibi başlatabilir.'; end if;
 if r.phase<>'lobby' then raise exception 'Oyun zaten başladı.'; end if;
 select array_agg(id order by random()) into ids from vk_private.players where room_id=r.id and participating and alive and not kicked;
 if coalesce(cardinality(ids),0)<4 then raise exception 'Başlamak için en az 4 kişi gerekli.'; end if;
 if coalesce((r.settings->>'two_vampires')::boolean,false) and cardinality(ids)<6 then raise exception 'İki vampir için en az 6 oyuncu gerekli.'; end if;
 if exists(select 1 from vk_private.players where room_id=r.id and participating and alive and not kicked and (not ready or last_seen<=now()-interval '20 seconds')) then
  raise exception 'Başlamak için bütün oyuncular hazır ve bağlı olmalı.';
 end if;
 cfg:=vk_private.settings(r.settings)||jsonb_build_object('rules_version','3','bodyguard','never');
 if cardinality(ids)<8 then cfg:=cfg||jsonb_build_object('wizard','never','alpha_vampire','never'); end if;
 if cardinality(ids)<6 then cfg:=cfg||jsonb_build_object('fanatic','never'); end if;
 update vk_private.players set wizard_used=false,alpha_used=false,fanatic_target=null,fanatic_won=false,fanatic_won_target=null,role_notices='[]',role='villager',alive=true,self_heal_used=false,eliminated_by=null where room_id=r.id and participating and alive and not kicked;
 update vk_private.players set role='vampire' where id=ids[1];
 if coalesce((r.settings->>'two_vampires')::boolean,false) then update vk_private.players set role='vampire' where id=ids[2]; idx:=3; end if;
 select count(*) into mandatory from unnest(options) as opt(role_key) where vk_private.role_mode(cfg,opt.role_key)='always';
 drawn:=vk_private.draw_roles(cfg,cardinality(ids)-idx+1);
 foreach k in array drawn loop
  update vk_private.players set role=k where id=ids[idx]; idx:=idx+1;
 end loop;
 update vk_private.rooms set role_pool_overflow=mandatory+case when coalesce((r.settings->>'two_vampires')::boolean,false) then 2 else 1 end>cardinality(ids) where id=r.id;
 if vk_private.role_mode(cfg,'alpha_vampire')='always' or (vk_private.role_mode(cfg,'alpha_vampire')='random' and random()<0.5) then update vk_private.players set role='alpha_vampire' where id=ids[1]; end if;
 update vk_private.players p set fanatic_target=(select q.id from vk_private.players q where q.room_id=r.id and q.alive and q.participating and not q.kicked and q.id<>p.id order by random() limit 1) where p.room_id=r.id and p.role='fanatic';
 update vk_private.rooms set rules_version=3,tie_streak=0,night_base_ends_at=null,phase='dealing',seq=seq+1,started_at=now(),ends_at=now()+interval '7 seconds',summary_complete=true,vote_candidates='{}' where id=r.id;
end $$;

create or replace function public.vk_act(p_code text,p_seq int,p_action text,p_target uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=vk_private.require_user(); r vk_private.rooms; me vk_private.players; target_player vk_private.players;
begin
 select * into r from vk_private.rooms where code=upper(btrim(p_code)) for update;
 if not found then raise exception 'Masa bulunamadı.'; end if;
 if exists(select 1 from vk_private.players where room_id=r.id and user_id=uid and kicked) then raise exception using errcode='VK001',message='Bu masadan çıkarıldın.'; end if;
 perform vk_private.advance(r.id);
 select * into me from vk_private.players where room_id=r.id and user_id=uid and participating and not kicked;
 if not found or not me.alive then raise exception 'Bu hamleyi yalnızca yaşayan oyuncular yapabilir.'; end if;
 select * into r from vk_private.rooms where id=r.id;
 if p_seq is distinct from r.seq then raise exception 'Oyun yeni aşamaya geçti. Ekran güncelleniyor.'; end if;
 if r.rules_version>=3 and r.phase='night' then perform public.vk_night_action(p_code,p_seq,p_action,case when p_target is null then '{}'::uuid[] else array[p_target] end); return; end if;
 if p_action='early' and r.phase in ('intro','day','runoff') then
  insert into vk_private.early_votes values(r.id,r.seq,me.id) on conflict do nothing;
 elsif p_action in ('vote','kill','protect') then
  select * into target_player from vk_private.players where id=p_target and room_id=r.id and alive and participating and not kicked;
  if not found then raise exception 'Hayatta olan bir oyuncu seçmelisin.'; end if;
  if p_action='vote' and r.phase='voting' then
   if cardinality(r.vote_candidates)>0 and not (p_target=any(r.vote_candidates)) then raise exception 'Yalnızca birincilikte eşit kalan adaylara oy verebilirsin.'; end if;
   if me.id=p_target then raise exception 'Kendine oy veremezsin.'; end if;
   if exists(select 1 from vk_private.votes where room_id=r.id and seq=r.seq and voter=me.id) then raise exception 'Oyun kaydedildi; değiştirilemez.'; end if;
   insert into vk_private.votes values(r.id,r.seq,me.id,p_target);
  elsif p_action='kill' and r.phase='night' and r.night_step in ('vampire','vampire_extra') and vk_private.can_hunt(r.id,me.id) then
   if r.night_step='vampire_extra' and p_target=r.victim then raise exception 'İkinci saldırı için farklı bir hedef seçmelisin.'; end if;
   if me.id=p_target then raise exception 'Kendini hedefleyemezsin.'; end if;
   if target_player.role in ('vampire','alpha_vampire','vampire_cub') then raise exception 'Vampir takım arkadaşını hedefleyemezsin.'; end if;
   if coalesce((r.settings->>'two_vampires')::boolean,false) then
    if target_player.role='vampire' then raise exception 'Vampir takım arkadaşını hedefleyemezsin.'; end if;
    insert into vk_private.vampire_choices(room_id,seq,actor,target) values(r.id,r.seq,me.id,p_target)
     on conflict(room_id,seq,actor) do update set target=excluded.target;
    delete from vk_private.round_actions where room_id=r.id and round_number=r.round_number and seq=r.seq and kind='kill' and actor=me.id and status='pending';
   else
    if (r.night_step='vampire' and r.victim is not null) or (r.night_step='vampire_extra' and r.extra_victim is not null) then raise exception 'Hedefin kaydedildi; değiştirilemez.'; end if;
    update vk_private.rooms set victim=case when r.night_step='vampire' then p_target else victim end,extra_victim=case when r.night_step='vampire_extra' then p_target else extra_victim end where id=r.id;
   end if;
  elsif p_action='protect' and r.phase='night' and r.night_step='doctor' and me.role='doctor' then
   if r.protected is not null then raise exception 'Koruman kaydedildi; değiştirilemez.'; end if;
   if me.id=p_target then
    if me.self_heal_used then raise exception 'Kendini koruma hakkını kullandın.'; end if;
    update vk_private.players set self_heal_used=true where id=me.id;
   end if;
   update vk_private.rooms set protected=p_target where id=r.id;
  else raise exception 'Bu aşamada bu hamleyi yapamazsın.';
  end if;
 else raise exception 'Bu aşamada bu hamleyi yapamazsın.';
 end if;
 if p_action in ('vote','kill','protect') then
  insert into vk_private.round_actions(room_id,round_number,seq,day,kind,actor,target)
   values(r.id,r.round_number,r.seq,r.day,p_action,me.id,p_target);
 end if;
 perform vk_private.advance(r.id);
end $$;

-- Revision token serializes transfers independently of game phase changes.
create or replace function public.vk_transfer_host(p_code text,p_revision int,p_target uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=vk_private.require_user(); r vk_private.rooms; successor vk_private.players;
begin
 select * into r from vk_private.rooms where code=upper(btrim(p_code)) for update;
 if not found then raise exception 'Masa bulunamadı.'; end if;
 if r.closed_at is not null then raise exception using errcode='VK002',message='Bu masa kapatıldı.'; end if;
 perform vk_private.maintain_host(r.id);
 select * into r from vk_private.rooms where id=r.id;
 if r.host_id<>uid then raise exception 'Yönetimi yalnızca masa sahibi devredebilir.'; end if;
 if p_revision is distinct from r.host_revision then raise exception 'Masa yönetimi değişti. Ekranı yenileyip tekrar dene.'; end if;
 select * into successor from vk_private.players where id=p_target and room_id=r.id and (participating or spectator) and not kicked and last_seen>now()-interval '20 seconds';
 if not found then raise exception 'Masada bağlı olan bir oyuncu seçmelisin.'; end if;
 if successor.user_id=uid then raise exception 'Zaten masa sahibisin.'; end if;
 update vk_private.rooms set host_id=successor.user_id,host_seen_at=successor.last_seen,host_revision=host_revision+1,
  events=events||jsonb_build_array(jsonb_build_object('day',r.day,'text',format('Masa yönetimi #%s %s oyuncusuna devredildi.',successor.number,successor.name))) where id=r.id;
end $$;

create or replace function public.vk_state(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=vk_private.require_user(); r vk_private.rooms; me vk_private.players;
 plist jsonb; tally jsonb; picked uuid; early_count int; early_mine boolean; turn boolean:=false; chosen boolean:=false;
 observer boolean; speech jsonb; count_speakers int; speaker_id uuid; can_rejoin boolean;
begin
 select * into r from vk_private.rooms where code=upper(btrim(p_code)) for update;
 if not found then raise exception 'Masa bulunamadı.'; end if;
 select * into me from vk_private.players where room_id=r.id and user_id=uid;
 if not found and r.host_id<>uid and not (uid=any(r.observer_ids)) then raise exception 'Önce bu masaya katılmalısın.'; end if;
 if me.kicked then raise exception using errcode='VK001',message='Bu masadan çıkarıldın.'; end if;
 -- VK001 also returns older web clients to the home screen.
 if r.closed_at is not null then raise exception using errcode='VK001',message='Bu masa kapatıldı.'; end if;
 -- Reconcile before the heartbeat: returning after the deadline cannot revive a player.
 perform vk_private.advance(r.id);
 select * into r from vk_private.rooms where id=r.id;
 if me.id is not null then
  can_rejoin:=r.phase='lobby' and not me.spectator and (exists(select 1 from vk_private.players where id=me.id and participating)
   or (select count(*) from vk_private.players where room_id=r.id and participating and not kicked)<24);
  update vk_private.players set last_seen=now(),
   participating=case when can_rejoin then true else participating end,
   alive=case when can_rejoin then true else alive end,
   eliminated_by=case when can_rejoin then null else eliminated_by end
   where id=me.id returning * into me;
 end if;
 perform vk_private.maintain_host(r.id);
 update vk_private.rooms set host_seen_at=now() where id=r.id and host_id=uid;
 select * into r from vk_private.rooms where id=r.id;
 observer:=me.id is null or not me.participating;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'number',number,'name',name,'alive',alive,'silenced',muted_day=r.day and r.phase in ('day','runoff','voting','mayor_decision'),
  'online',last_seen>now()-interval '20 seconds','ready',ready,
  'disconnect_ends_at',case when alive and last_seen<=now()-interval '20 seconds' then last_seen+make_interval(secs=>coalesce((r.settings->>'disconnect_seconds')::int,60)) else null end,'eliminated_by',case when (r.phase<>'finished' or coalesce(me.spectator,false)) and eliminated_by='magic' then 'night' else eliminated_by end,
  'won',case when r.phase='finished' and not coalesce(me.spectator,false) then vk_private.player_won(players,r.winner) else null end,
  'fanatic_target_mark',case when r.phase='finished' and not coalesce(me.spectator,false) then exists(select 1 from vk_private.players f where f.room_id=r.id and (f.fanatic_target=players.id or f.fanatic_won_target=players.id)) else false end,
  'role',case when r.phase='finished' and not coalesce(me.spectator,false) then role else null end) order by number),'[]'::jsonb)
 into plist from vk_private.players where room_id=r.id and participating;
 select target into picked from vk_private.votes where room_id=r.id and seq=r.seq and voter=me.id;
 if picked is not null then
  select coalesce(jsonb_object_agg(target::text,n),'{}') into tally from
   (select v.target,sum(case when vp.role='mayor' then 2 else 1 end) n from vk_private.votes v join vk_private.players vp on vp.id=v.voter where v.room_id=r.id and v.seq=r.seq group by v.target) counts;
 end if;
 select count(*),coalesce(bool_or(voter=me.id),false) into early_count,early_mine
  from vk_private.early_votes where room_id=r.id and seq=r.seq;
 if not observer then
  turn:=(r.phase='night' and me.alive and (me.role=r.night_step or (r.night_step in ('vampire','vampire_extra') and vk_private.can_hunt(r.id,me.id))))
   or (r.phase='hunter' and me.id=r.hunter_pending) or (r.phase='mayor_decision' and me.alive and me.role='mayor');
  chosen:=case when turn and r.night_step in ('vampire','vampire_extra') and coalesce((r.settings->>'two_vampires')::boolean,false) then exists(select 1 from vk_private.vampire_choices where room_id=r.id and seq=r.seq and actor=me.id)
   when turn and r.night_step='vampire' then r.victim is not null when turn and r.night_step='vampire_extra' then r.extra_victim is not null
   when turn and me.role='doctor' then r.protected is not null when turn and me.role='bodyguard' then r.guard_target is not null when turn and me.role='shaman' then r.silence_target is not null else false end;
 end if;
 if r.rules_version>=3 and r.phase='night' and not observer then
  turn:=vk_private.night_actor(r,me);
  chosen:=exists(select 1 from vk_private.night_choices where room_id=r.id and round_number=r.round_number and seq=r.seq and actor=me.id);
 end if;
 count_speakers:=cardinality(r.speech_order);
 if r.phase in ('intro','day') and coalesce((r.settings->>'turn_based')::boolean,false) and count_speakers>0 then
  if r.speech_turn<count_speakers*2 then speaker_id:=r.speech_order[r.speech_turn%count_speakers+1]; end if;
  speech:=jsonb_build_object('order',r.speech_order,'turn_index',r.speech_turn,'round',least(2,r.speech_turn/count_speakers+1),
   'speaker_id',speaker_id,'ends_at',r.speech_ends_at,'slot_ms',r.speech_slot_ms,'group',speaker_id is null);
 end if;
 return jsonb_build_object('member',case when me.id is null then null else jsonb_build_object('id',me.id,'number',me.number,'name',me.name,'spectator',me.spectator) end,
  'role_details_hidden',coalesce(me.spectator,false),
  'spectators',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'number',number,'name',name,'spectator',true,'alive',false,'ready',false,'role',null,'online',last_seen>now()-interval '20 seconds') order by number),'[]'::jsonb) from vk_private.players where room_id=r.id and spectator and not kicked),
  'code',r.code,'phase',r.phase,'seq',r.seq,'day',r.day,'round_number',r.round_number,
  'rules_version',r.rules_version,'tie_streak',r.tie_streak,'night_base_ends_at',r.night_base_ends_at,
  'started_at',r.started_at,'ends_at',r.ends_at,'server_now',now(),'settings',vk_private.settings(r.settings),
  'is_host',r.host_id=uid,'is_observer',observer,
  'host',jsonb_build_object('player_id',(select id from vk_private.players where room_id=r.id and user_id=r.host_id),
   'name',coalesce((select name from vk_private.players where room_id=r.id and user_id=r.host_id),'Paylaşım ekranı'),
   'online',r.host_seen_at>now()-interval '20 seconds','revision',r.host_revision,
   'recovery_ends_at',case when r.host_seen_at<=now()-interval '20 seconds' then r.host_seen_at+make_interval(secs=>coalesce((r.settings->>'disconnect_seconds')::int,60)) else null end),
  'vote_candidates',r.vote_candidates,'votes_required',(select count(*) from vk_private.players where room_id=r.id and alive and participating and not kicked)-case when cardinality(r.vote_candidates)=1 then 1 else 0 end,
  'can_vote',not observer and me.alive and not (cardinality(r.vote_candidates)=1 and me.id=r.vote_candidates[1]),
  'summary',case when r.phase='finished' and not coalesce(me.spectator,false) then jsonb_build_object('complete',r.summary_complete,'actions',
   (select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'day',a.day,'seq',a.seq,'kind',a.kind,'actor',a.actor,'target',a.target,'status',a.status,'details',a.details) order by a.id),'[]'::jsonb)
    from vk_private.round_actions a where a.room_id=r.id and a.round_number=r.round_number)) else null end,'players',plist,'winner',r.winner,'announcement',r.announcement,'events',r.events,
  'me',case when observer then null else jsonb_build_object('id',me.id,'number',me.number,'name',me.name,'alive',me.alive,'ready',me.ready,
    'role',case when r.phase<>'lobby' then me.role else null end,'self_heal_used',me.self_heal_used,'shot_used',me.shot_used,'silenced',me.muted_day=r.day,'can_hunt',vk_private.can_hunt(r.id,me.id),'eliminated_by',me.eliminated_by,'faction',vk_private.faction(me.role),'won',case when r.phase='finished' then vk_private.player_won(me,r.winner) else null end,
    'wizard_used',me.wizard_used,'alpha_used',me.alpha_used,'fanatic_won',me.fanatic_won,'fanatic_target',case when r.phase<>'lobby' then me.fanatic_target else null end,'role_notices',case when r.phase<>'lobby' then me.role_notices else '[]'::jsonb end) end,
  'vampire_decision',case when not observer and vk_private.can_hunt(r.id,me.id) and r.phase in ('night','night_result') then r.vampire_decision else null end,
  'vampire_team',case when not observer and vk_private.can_hunt(r.id,me.id) and r.phase<>'lobby'
   then (select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'target',case when r.rules_version>=3 then (select nc.targets[1] from vk_private.night_choices nc where nc.room_id=r.id and nc.round_number=r.round_number and nc.seq=r.seq and nc.actor=p.id and nc.kind in ('kill','bite')) else c.target end,'kind',case when r.rules_version>=3 then (select nc.kind from vk_private.night_choices nc where nc.room_id=r.id and nc.round_number=r.round_number and nc.seq=r.seq and nc.actor=p.id) else null end) order by p.number),'[]'::jsonb) from vk_private.players p left join vk_private.vampire_choices c on c.actor=p.id and c.room_id=r.id and c.seq=r.seq and r.phase='night' and r.night_step in ('vampire','vampire_extra') where p.room_id=r.id and p.role in ('vampire','alpha_vampire','vampire_cub') and p.alive and p.participating and not p.kicked) else null end,
  'night_choice',case when r.rules_version>=3 and not observer and r.phase='night' then (select jsonb_build_object('kind',kind,'targets',targets) from vk_private.night_choices where room_id=r.id and round_number=r.round_number and seq=r.seq and actor=me.id) else null end,
  'night_action',case when turn and r.phase='night' and r.rules_version>=3 then case when vk_private.can_hunt(r.id,me.id) then 'kill' when me.role='doctor' then 'protect' when me.role='wizard' then 'swap' when me.role='bodyguard' then 'guard' when me.role='shaman' then 'silence' end when turn and r.phase='night' then case r.night_step when 'vampire_extra' then 'kill' when 'vampire' then 'kill' when 'doctor' then 'protect' when 'bodyguard' then 'guard' when 'shaman' then 'silence' end else null end,
  'attack_number',case when r.rules_version>=3 and r.bonus_attacks=2 then 2 when r.night_step='vampire_extra' then 2 else 1 end,
  'excluded_targets',case when turn and r.night_step='vampire_extra' then jsonb_build_array(r.victim) else '[]'::jsonb end,
  'my_turn',turn,'has_chosen',chosen,'my_vote',picked,'tally',tally,'early_count',early_count,'early_mine',early_mine,
  'speech',speech,'votes_cast',case when r.phase='voting' then (select count(*) from vk_private.votes where room_id=r.id and seq=r.seq) else 0 end);
end $$;

create or replace function public.vk_kick(p_code text,p_seq int,p_target uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=vk_private.require_user(); r vk_private.rooms; target_player vk_private.players;
begin
 select * into r from vk_private.rooms where code=upper(btrim(p_code)) for update;
 if not found then raise exception 'Masa bulunamadı.'; end if;
 perform vk_private.maintain_host(r.id);
 select * into r from vk_private.rooms where id=r.id;
 if r.host_id<>uid then raise exception 'Oyuncuyu yalnızca masa sahibi çıkarabilir.'; end if;
 select * into target_player from vk_private.players where id=p_target and room_id=r.id;
 if not found then raise exception 'Bu oyuncu masada değil.'; end if;
 if target_player.user_id=uid then raise exception 'Kendini masadan çıkaramazsın.'; end if;
 if target_player.kicked then return; end if;
 perform vk_private.advance(r.id);
 select * into r from vk_private.rooms where id=r.id;
 if r.seq is distinct from p_seq then raise exception 'Masa yeni aşamaya geçti. Ekran güncelleniyor.'; end if;
 update vk_private.players set kicked=true,alive=false,ready=false,eliminated_by='kicked',participating=(r.phase<>'lobby' and not target_player.spectator) where id=p_target;
 delete from vk_private.voice_signals where room_id=r.id and (sender in (select session_id from vk_private.voice_peers where room_id=r.id and user_id=target_player.user_id) or recipient in (select session_id from vk_private.voice_peers where room_id=r.id and user_id=target_player.user_id));
 delete from vk_private.voice_peers where room_id=r.id and user_id=target_player.user_id;
 update vk_private.rooms set events=events||jsonb_build_array(jsonb_build_object('day',r.day,'text',format('#%s %s masa sahibi tarafından çıkarıldı.',target_player.number,target_player.name))),
  announcement=case when r.phase not in ('lobby','finished') then jsonb_build_object('kind','departure','text',format('#%s %s masadan çıkarıldı. Kalan oyuncularla devam ediliyor; seçimlerini kontrol et.',target_player.number,target_player.name)) else announcement end where id=r.id;
 perform vk_private.advance(r.id);
end $$;

-- Only the current speaker may finish their turn; stale taps cannot skip a later turn.
create or replace function public.vk_speak(p_code text,p_seq int,p_turn int) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=vk_private.require_user(); r vk_private.rooms; me vk_private.players; count_speakers int;
begin
 select * into r from vk_private.rooms where code=upper(btrim(p_code)) for update;
 if not found then raise exception 'Masa bulunamadı.'; end if;
 perform vk_private.advance(r.id);
 select * into me from vk_private.players where room_id=r.id and user_id=uid and alive and participating and not kicked;
 if not found then raise exception 'Sadece sırası gelen oyuncu sözünü bitirebilir.'; end if;
 select * into r from vk_private.rooms where id=r.id;
 count_speakers:=cardinality(r.speech_order);
 if r.seq is distinct from p_seq or r.speech_turn is distinct from p_turn then raise exception 'Konuşma sırası değişti. Ekran güncelleniyor.'; end if;
 if r.phase not in ('intro','day') or not coalesce((r.settings->>'turn_based')::boolean,false)
  or count_speakers=0 or r.speech_turn>=count_speakers*2 then raise exception 'Şu anda serbest konuşma zamanı.'; end if;
 if r.speech_order[r.speech_turn%count_speakers+1]<>me.id then raise exception 'Şu anda başka bir oyuncu konuşuyor.'; end if;
 update vk_private.rooms set speech_turn=speech_turn+1,
  ends_at=now()+make_interval(secs=>(count_speakers*2-speech_turn-1)*speech_slot_ms/1000.0+(settings->>'day_seconds')::int),
  speech_ends_at=case when speech_turn+1<count_speakers*2 then now()+make_interval(secs=>speech_slot_ms/1000.0) else null end
  where id=r.id;
end $$;

create or replace function vk_private.voice_can_speak(r vk_private.rooms, pid uuid) returns boolean
language plpgsql stable set search_path = '' as $$
declare count_speakers int:=cardinality(r.speech_order);
begin
 if pid is null or not coalesce((r.settings->>'voice_enabled')::boolean,false)
    or not coalesce((r.settings->>'turn_based')::boolean,false)
    or not exists(select 1 from vk_private.players where id=pid and room_id=r.id and alive and participating and not kicked and muted_day is distinct from r.day)
    or r.ends_at is null or r.ends_at<=now() then return false; end if;
 if r.phase='runoff' then return true; end if;
 if r.phase not in ('intro','day') or count_speakers=0 then return false; end if;
 if r.speech_turn>=count_speakers*2 then return true; end if;
 return r.speech_order[r.speech_turn%count_speakers+1]=pid and r.speech_ends_at>now();
end $$;

create or replace function public.vk_voice_sync(p_code text,p_session uuid,p_after bigint default 0,
 p_messages jsonb default '[]',p_join boolean default false,p_mic boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=vk_private.require_user(); r vk_private.rooms; me vk_private.players;
 joined vk_private.voice_peers; msg jsonb; dest uuid; peers jsonb; signals jsonb; permitted boolean;
begin
 select * into r from vk_private.rooms where code=upper(btrim(p_code));
 if not found then raise exception 'Masa bulunamadı.'; end if;
 select * into me from vk_private.players where room_id=r.id and user_id=uid;
 if not found and r.host_id<>uid and not (uid=any(r.observer_ids)) then raise exception 'Önce bu masaya katılmalısın.'; end if;
 if me.kicked then raise exception using errcode='VK001',message='Bu masadan çıkarıldın.'; end if;
 perform vk_private.advance(r.id);
 select * into r from vk_private.rooms where id=r.id;
 if me.id is not null then select * into me from vk_private.players where id=me.id; end if;
 if not coalesce((r.settings->>'voice_enabled')::boolean,false) or not coalesce((r.settings->>'turn_based')::boolean,false)
    or r.closed_at is not null or r.phase='finished' then
  delete from vk_private.voice_peers where room_id=r.id and user_id=uid;
  return jsonb_build_object('enabled',false,'peers','[]'::jsonb,'signals','[]'::jsonb,'can_speak',false,'server_now',now());
 end if;
 if p_session is null then raise exception 'Sesli oturum kimliği gerekli.'; end if;
 if jsonb_typeof(p_messages) is distinct from 'array' or jsonb_array_length(p_messages)>40
    or octet_length(p_messages::text)>262144 then raise exception 'Ses bağlantı isteği çok büyük.'; end if;
 -- Expired negotiation messages and abandoned sessions are ephemeral.
 delete from vk_private.voice_signals where created_at<now()-interval '2 minutes';
 delete from vk_private.voice_peers where last_seen<now()-interval '20 seconds';
 permitted:=vk_private.voice_can_speak(r,me.id);
 if p_join then
  insert into vk_private.voice_peers(room_id,user_id,session_id,player_id,mic_open)
   values(r.id,uid,p_session,me.id,false)
   on conflict(room_id,user_id) do update set session_id=excluded.session_id,player_id=excluded.player_id,
    mic_open=false,last_seen=now();
 end if;
 update vk_private.voice_peers set last_seen=now(),mic_open=coalesce(p_mic,false) and permitted
  where room_id=r.id and user_id=uid and session_id=p_session returning * into joined;
 if not found then raise exception 'Sesli oturum kapandı veya başka sekmede açıldı.'; end if;
 for msg in select value from jsonb_array_elements(p_messages) loop
  if jsonb_typeof(msg) is distinct from 'object' or jsonb_typeof(msg->'payload') is distinct from 'object'
     or coalesce(msg->'payload'->>'type','') not in ('offer','answer','ice')
     or octet_length((msg->'payload')::text)>32768 then raise exception 'Geçersiz ses bağlantı mesajı.'; end if;
  dest:=(msg->>'to')::uuid;
  if dest<>p_session and exists(select 1 from vk_private.voice_peers where room_id=r.id and session_id=dest) then
   if msg->>'id' is null then raise exception 'Ses mesajı kimliği gerekli.'; end if;
   insert into vk_private.voice_signals(room_id,sender,recipient,payload,client_id)
    values(r.id,p_session,dest,msg->'payload',(msg->>'id')::uuid) on conflict(room_id,sender,client_id) do nothing;
  end if;
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('session_id',v.session_id,'player_id',v.player_id,
  'name',coalesce(p.name,'Masa kurucusu'),'number',p.number,
  'mic_open',v.mic_open and vk_private.voice_can_speak(r,v.player_id),
  'can_speak',vk_private.voice_can_speak(r,v.player_id)) order by p.number nulls last),'[]'::jsonb)
  into peers from vk_private.voice_peers v left join vk_private.players p on p.id=v.player_id where v.room_id=r.id;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'from',s.sender,'payload',s.payload) order by s.id),'[]'::jsonb)
  into signals from (select s.* from vk_private.voice_signals s where s.room_id=r.id and s.recipient=p_session
   and s.id>greatest(coalesce(p_after,0),0) and exists(select 1 from vk_private.voice_peers v where v.room_id=r.id and v.session_id=s.sender)
   order by s.id limit 100) s;
 return jsonb_build_object('enabled',true,'peers',peers,'signals',signals,'can_speak',permitted,'server_now',now());
end $$;

create or replace function public.vk_voice_leave(p_code text,p_session uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=vk_private.require_user(); rid uuid;
begin
 select id into rid from vk_private.rooms where code=upper(btrim(p_code));
 delete from vk_private.voice_peers where room_id=rid and user_id=uid and session_id=p_session;
 if found then delete from vk_private.voice_signals where room_id=rid and (sender=p_session or recipient=p_session); end if;
end $$;

revoke all on function public.vk_transfer_host(text,int,uuid) from public,anon;
grant execute on function public.vk_transfer_host(text,int,uuid) to authenticated;
revoke all on all tables in schema vk_private from public,anon,authenticated;
revoke all on all functions in schema vk_private from public,anon,authenticated;
revoke all on function public.vk_quota(),public.vk_create(text,jsonb),public.vk_join(text,text),public.vk_start(text),public.vk_act(text,int,text,uuid),public.vk_state(text),public.vk_speak(text,int,int) from public,anon;
grant execute on function public.vk_quota(),public.vk_create(text,jsonb),public.vk_join(text,text),public.vk_start(text),public.vk_act(text,int,text,uuid),public.vk_state(text),public.vk_speak(text,int,int) to authenticated;
revoke all on function public.vk_voice_sync(text,uuid,bigint,jsonb,boolean,boolean),public.vk_voice_leave(text,uuid) from public,anon;
grant execute on function public.vk_voice_sync(text,uuid,bigint,jsonb,boolean,boolean),public.vk_voice_leave(text,uuid) to authenticated;
revoke all on function public.vk_ready(text,int,boolean),public.vk_rematch(text,int) from public,anon;
grant execute on function public.vk_ready(text,int,boolean),public.vk_rematch(text,int) to authenticated;
revoke all on function public.vk_create(text,jsonb,text),public.vk_enter(text,text,text),public.vk_kick(text,int,uuid) from public,anon;
grant execute on function public.vk_create(text,jsonb,text),public.vk_enter(text,text,text),public.vk_kick(text,int,uuid) to authenticated;
revoke all on function public.vk_update_lobby(text,int,jsonb),public.vk_rename(text,int,text) from public,anon;
grant execute on function public.vk_update_lobby(text,int,jsonb),public.vk_rename(text,int,text) to authenticated;
revoke all on function public.vk_night_action(text,int,text,uuid[]) from public,anon;
grant execute on function public.vk_night_action(text,int,text,uuid[]) to authenticated;
revoke all on function public.vk_ability(text,int,text,uuid) from public,anon;
grant execute on function public.vk_ability(text,int,text,uuid) to authenticated;
revoke all on function public.vk_set_spectator(text,int,uuid,boolean),public.vk_return_lobby(text,int),public.vk_close_room(text,int) from public,anon;
grant execute on function public.vk_set_spectator(text,int,uuid,boolean),public.vk_return_lobby(text,int),public.vk_close_room(text,int) to authenticated;
commit;
