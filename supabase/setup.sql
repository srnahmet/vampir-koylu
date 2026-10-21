-- Vampir Köylü v1. Run once in Supabase SQL Editor.
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
create table if not exists vk_private.votes (
 room_id uuid not null references vk_private.rooms(id) on delete cascade,
 seq integer not null,
 voter uuid not null references vk_private.players(id),
 target uuid not null references vk_private.players(id),
 primary key(room_id,seq,voter)
);
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

create or replace function vk_private.require_user() returns uuid
language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'Önce oyuna giriş yapmalısın.'; end if;
 return auth.uid();
end $$;

create or replace function vk_private.settings(raw jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare d int; n int; v int; e int; t text;
begin
 d := coalesce((raw->>'day_seconds')::int,300);
 n := coalesce((raw->>'night_seconds')::int,15);
 v := coalesce((raw->>'vote_seconds')::int,20);
 e := coalesce((raw->>'runoff_seconds')::int,60);
 t := coalesce(raw->>'theme','classic');
 if d not between 30 and 1800 or n not between 15 and 120 or v not between 20 and 120 or e not between 15 and 300 then
  raise exception 'Süreler izin verilen aralıkta olmalı.';
 end if;
 if t not in ('classic','lavender','forest','peach') then t := 'classic'; end if;
 return jsonb_build_object('day_seconds',d,'night_seconds',n,'vote_seconds',v,'runoff_seconds',e,
  'doctor',coalesce((raw->>'doctor')::boolean,false),'jester',coalesce((raw->>'jester')::boolean,false),'theme',t);
end $$;

-- Room lock serializes joining, dealing, actions and timer transitions.
-- Timers use database time. No host browser or scheduled server is required.
create or replace function vk_private.advance(rid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r vk_private.rooms; alive_count int; votes_count int; needed int;
 target_id uuid; p vk_private.players; night_next boolean := false; dur int;
begin
 select * into r from vk_private.rooms where id=rid for update;
 if not found or r.phase in ('lobby','finished') then return; end if;
 select count(*) into alive_count from vk_private.players where room_id=rid and alive;
 needed := alive_count/2+1;
 if r.phase='day' then
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
 when 'night' then
  if r.night_step='vampire' then
   if r.victim is null then return; end if;
   if exists(select 1 from vk_private.players where room_id=rid and alive and role='doctor') then
    r.night_step:='doctor'; dur:=(r.settings->>'night_seconds')::int;
   else r.night_step:='resolve'; end if;
  elsif r.night_step='doctor' then
   if r.protected is null then return; end if;
   r.night_step:='resolve';
  end if;
  if r.night_step='resolve' then
   if r.victim is distinct from r.protected then
    update vk_private.players set alive=false,eliminated_by='vampire' where id=r.victim returning * into p;
    r.announcement:=jsonb_build_object('kind','night_death','number',p.number,'name',p.name,'text',format('%s · %s bu gece köye veda etti.',p.number,p.name));
   else
    r.announcement:=jsonb_build_object('kind','saved','text','Günaydın köy! Bu gece kimse ölmedi.');
   end if;
   r.events:=r.events||jsonb_build_array(jsonb_build_object('day',r.day,'text',r.announcement->>'text'));
   r.phase:='night_result'; dur:=7;
  end if;
 when 'night_result' then
  r.day:=r.day+1; r.phase:='day'; dur:=(r.settings->>'day_seconds')::int;
 when 'voting' then
  select count(*) into votes_count from vk_private.votes where room_id=rid and seq=r.seq;
  if votes_count<alive_count then return; end if;
  select target into target_id from vk_private.votes where room_id=rid and seq=r.seq
    group by target having count(*)>=needed limit 1;
  if target_id is null then
   r.phase:='runoff'; dur:=(r.settings->>'runoff_seconds')::int;
   r.announcement:=jsonb_build_object('kind','tie','text','Çoğunluk sağlanamadı. Biraz daha konuşalım; ardından oylar yeniden açılacak.');
   r.events:=r.events||jsonb_build_array(jsonb_build_object('day',r.day,'text','Oylamada çoğunluk sağlanamadı.'));
  else
   update vk_private.players set alive=false,eliminated_by='village' where id=target_id returning * into p;
   r.announcement:=jsonb_build_object('kind','execution','number',p.number,'name',p.name,'text',format('%s · %s köyün kararıyla idam edildi.',p.number,p.name));
   r.events:=r.events||jsonb_build_array(jsonb_build_object('day',r.day,'text',r.announcement->>'text'));
   if p.role='jester' then r.phase:='finished'; r.winner:='jester'; dur:=0;
   elsif p.role='vampire' then r.phase:='finished'; r.winner:='village'; dur:=0;
   else r.phase:='execution'; dur:=7;
   end if;
  end if;
 when 'execution' then night_next:=true;
 else return;
 end case;

 if night_next then
  select count(*) into alive_count from vk_private.players where room_id=rid and alive;
  if alive_count<=3 then r.phase:='finished'; r.winner:='vampire'; dur:=0;
  else
   r.phase:='night'; r.night_step:='vampire'; r.victim:=null; r.protected:=null;
   dur:=(r.settings->>'night_seconds')::int;
  end if;
 end if;
 update vk_private.rooms set phase=r.phase,seq=r.seq+1,day=r.day,started_at=now(),
  ends_at=now()+make_interval(secs=>dur),night_step=r.night_step,victim=r.victim,protected=r.protected,
  winner=r.winner,announcement=r.announcement,events=r.events where id=rid;
end $$;

create or replace function public.vk_create(p_name text, p_settings jsonb default '{}') returns text
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=vk_private.require_user(); rid uuid; c text; cfg jsonb;
begin
 if char_length(btrim(p_name)) not between 1 and 20 then raise exception 'İsmin 1–20 karakter olmalı.'; end if;
 if (select count(*) from vk_private.rooms where host_id=uid and created_at>now()-interval '1 hour')>=5 then
  raise exception 'Bu saat yeterince masa kurdun. Mevcut masana dönebilirsin.';
 end if;
 cfg:=vk_private.settings(p_settings);
 loop
  c:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  begin
   insert into vk_private.rooms(code,host_id,settings) values(c,uid,cfg) returning id into rid;
   exit;
  exception when unique_violation then null;
  end;
 end loop;
 insert into vk_private.players(room_id,user_id,number,name) values(rid,uid,1,btrim(p_name));
 return c;
end $$;

create or replace function public.vk_join(p_code text, p_name text) returns text
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=vk_private.require_user(); r vk_private.rooms; num int;
begin
 select * into r from vk_private.rooms where code=upper(btrim(p_code)) for update;
 if not found then raise exception 'Bu kodla bir masa bulunamadı.'; end if;
 if exists(select 1 from vk_private.players where room_id=r.id and user_id=uid) then return r.code; end if;
 if r.created_at<now()-interval '24 hours' then raise exception 'Bu masanın süresi dolmuş. Yeni bir masa kurun.'; end if;
 if r.phase<>'lobby' then raise exception 'Oyun başladı; artık bu masaya katılamazsın.'; end if;
 if char_length(btrim(p_name)) not between 1 and 20 then raise exception 'İsmin 1–20 karakter olmalı.'; end if;
 select coalesce(max(number),0)+1 into num from vk_private.players where room_id=r.id;
 if num>24 then raise exception 'Masa dolu! En fazla 24 kişi katılabilir.'; end if;
 insert into vk_private.players(room_id,user_id,number,name) values(r.id,uid,num,btrim(p_name));
 return r.code;
end $$;

create or replace function public.vk_start(p_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=vk_private.require_user(); r vk_private.rooms; ids uuid[];
 idx int:=2;
begin
 select * into r from vk_private.rooms where code=upper(btrim(p_code)) for update;
 if not found or r.host_id<>uid then raise exception 'Oyunu yalnızca masayı kuran kişi başlatabilir.'; end if;
 if r.phase<>'lobby' then raise exception 'Oyun zaten başladı.'; end if;
 select array_agg(id order by random()) into ids from vk_private.players where room_id=r.id;
 if cardinality(ids)<4 then raise exception 'Başlamak için en az 4 kişi gerekli.'; end if;
 update vk_private.players set role='villager',alive=true where room_id=r.id;
 update vk_private.players set role='vampire' where id=ids[1];
 if (r.settings->>'doctor')::boolean then
  update vk_private.players set role='doctor' where id=ids[idx]; idx:=idx+1;
 end if;
 if (r.settings->>'jester')::boolean then update vk_private.players set role='jester' where id=ids[idx]; end if;
 update vk_private.rooms set phase='dealing',seq=seq+1,started_at=now(),ends_at=now()+interval '7 seconds' where id=r.id;
end $$;

create or replace function public.vk_act(p_code text,p_seq int,p_action text,p_target uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=vk_private.require_user(); r vk_private.rooms; me vk_private.players; target_player vk_private.players;
begin
 select * into r from vk_private.rooms where code=upper(btrim(p_code)) for update;
 if not found then raise exception 'Masa bulunamadı.'; end if;
 select * into me from vk_private.players where room_id=r.id and user_id=uid;
 if not found or not me.alive then raise exception 'Bu hamleyi yalnızca yaşayan oyuncular yapabilir.'; end if;
 perform vk_private.advance(r.id);
 select * into r from vk_private.rooms where id=r.id;
 if p_seq<>r.seq then raise exception 'Oyun yeni aşamaya geçti. Ekran güncelleniyor.'; end if;
 if p_action='early' and r.phase='day' then
  insert into vk_private.early_votes values(r.id,r.seq,me.id) on conflict do nothing;
 elsif p_action in ('vote','kill','protect') then
  select * into target_player from vk_private.players where id=p_target and room_id=r.id and alive;
  if not found then raise exception 'Hayatta olan bir oyuncu seçmelisin.'; end if;
  if p_action='vote' and r.phase='voting' then
   if me.id=p_target then raise exception 'Kendine oy veremezsin.'; end if;
   if exists(select 1 from vk_private.votes where room_id=r.id and seq=r.seq and voter=me.id) then raise exception 'Oyun kaydedildi; değiştirilemez.'; end if;
   insert into vk_private.votes values(r.id,r.seq,me.id,p_target);
  elsif p_action='kill' and r.phase='night' and r.night_step='vampire' and me.role='vampire' then
   if me.id=p_target then raise exception 'Kendini hedefleyemezsin.'; end if;
   if r.victim is not null then raise exception 'Hedefin kaydedildi; değiştirilemez.'; end if;
   update vk_private.rooms set victim=p_target where id=r.id;
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
 perform vk_private.advance(r.id);
end $$;

create or replace function public.vk_state(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=vk_private.require_user(); r vk_private.rooms; me vk_private.players;
 plist jsonb; tally jsonb; picked uuid; early_count int; early_mine boolean; turn boolean; chosen boolean;
begin
 select * into r from vk_private.rooms where code=upper(btrim(p_code));
 if not found then raise exception 'Masa bulunamadı.'; end if;
 select * into me from vk_private.players where room_id=r.id and user_id=uid;
 if not found then raise exception 'Önce bu masaya katılmalısın.'; end if;
 perform vk_private.advance(r.id);
 select * into r from vk_private.rooms where id=r.id;
 update vk_private.players set last_seen=now() where id=me.id returning * into me;
 select jsonb_agg(jsonb_build_object('id',id,'number',number,'name',name,'alive',alive,
  'online',last_seen>now()-interval '20 seconds','eliminated_by',eliminated_by,
  'role',case when r.phase='finished' then role else null end) order by number)
 into plist from vk_private.players where room_id=r.id;
 select target into picked from vk_private.votes where room_id=r.id and seq=r.seq and voter=me.id;
 if picked is not null then
  select coalesce(jsonb_object_agg(target::text,n),'{}') into tally from
   (select target,count(*) n from vk_private.votes where room_id=r.id and seq=r.seq group by target) counts;
 end if;
 select count(*),coalesce(bool_or(voter=me.id),false) into early_count,early_mine
  from vk_private.early_votes where room_id=r.id and seq=r.seq;
 turn:=r.phase='night' and me.alive and me.role=r.night_step;
 chosen:=case when turn and me.role='vampire' then r.victim is not null
              when turn and me.role='doctor' then r.protected is not null else false end;
 return jsonb_build_object('code',r.code,'phase',r.phase,'seq',r.seq,'day',r.day,
  'started_at',r.started_at,'ends_at',r.ends_at,'server_now',now(),'settings',r.settings,
  'is_host',r.host_id=uid,'players',plist,'winner',r.winner,'announcement',r.announcement,'events',r.events,
  'me',jsonb_build_object('id',me.id,'number',me.number,'name',me.name,'alive',me.alive,
    'role',case when r.phase<>'lobby' then me.role else null end,'self_heal_used',me.self_heal_used,'eliminated_by',me.eliminated_by),
  'my_turn',turn,'has_chosen',chosen,'my_vote',picked,'tally',tally,'early_count',early_count,'early_mine',early_mine,
  'votes_cast',case when r.phase='voting' then (select count(*) from vk_private.votes where room_id=r.id and seq=r.seq) else 0 end);
end $$;

revoke all on all tables in schema vk_private from public,anon,authenticated;
revoke all on all functions in schema vk_private from public,anon,authenticated;
revoke all on function public.vk_create(text,jsonb),public.vk_join(text,text),public.vk_start(text),public.vk_act(text,int,text,uuid),public.vk_state(text) from public,anon;
grant execute on function public.vk_create(text,jsonb),public.vk_join(text,text),public.vk_start(text),public.vk_act(text,int,text,uuid),public.vk_state(text) to authenticated;
commit;
