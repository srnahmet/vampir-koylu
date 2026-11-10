-- Apply to an existing V2 database before deploying web 2.0.1.
-- No games or ballots are deleted. Safe to reapply.
begin;
alter table vk_private.rooms add column if not exists role_pool_overflow boolean not null default false;
create or replace function vk_private.draw_roles(raw jsonb,slots int) returns text[]
language plpgsql volatile set search_path = '' as $$
declare options text[]:=array['doctor','jester','mayor','bodyguard','hunter','shaman','gunslinger','vampire_cub']; mandatory_roles text[]; chance_roles text[];
begin
 if slots<1 then return '{}'::text[]; end if;
 select coalesce(array_agg(k order by random()),'{}'::text[]) into mandatory_roles
  from unnest(options) as opt(k) where vk_private.role_mode(raw,k)='always';
 if cardinality(mandatory_roles)>=slots then return mandatory_roles[1:slots]; end if;
 select coalesce(array_agg(k order by random()),'{}'::text[]) into chance_roles
  from unnest(options) as opt(k) where vk_private.role_mode(raw,k)='random' and random()<0.5;
 return mandatory_roles||chance_roles[1:slots-cardinality(mandatory_roles)];
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

create or replace function vk_private.reconcile(rid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r vk_private.rooms; p vk_private.players; changed boolean:=false; reset_night boolean:=false; living int; has_vampire boolean; town_count int;
begin
 perform vk_private.maintain_host(rid);
 select * into r from vk_private.rooms where id=rid for update;
 if not found or r.phase='finished' then return; end if;
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
 select count(*),coalesce(bool_or(role in ('vampire','vampire_cub')),false),count(*) filter (where role not in ('vampire','vampire_cub')) into living,has_vampire,town_count from vk_private.players where room_id=rid and participating and alive and not kicked;
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
 if r.phase='night' and ((r.victim is not null and not exists(select 1 from vk_private.players where id=r.victim and alive and participating and not kicked)) or (r.extra_victim is not null and not exists(select 1 from vk_private.players where id=r.extra_victim and alive and participating and not kicked))) then
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
 if not found or r.phase in ('lobby','finished') then return; end if;
 select count(*) into alive_count from vk_private.players where room_id=rid and alive;
 needed := alive_count/2+1;
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
     select id into target_id from vk_private.players where room_id=rid and alive and participating and not kicked and role not in ('vampire','vampire_cub')
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
   r.phase:=case when exists(select 1 from vk_private.players where room_id=rid and alive and participating and not kicked and role='mayor') then 'mayor_decision' else 'runoff' end; dur:=case when r.phase='mayor_decision' then 30 else (r.settings->>'runoff_seconds')::int end;
   r.announcement:=jsonb_build_object('kind','tie','text','En yüksek oyda eşitlik var. Biraz daha konuşalım; ardından yalnızca birincilikte eşit kalan adaylar oylanacak.');
   r.events:=r.events||jsonb_build_array(jsonb_build_object('day',r.day,'text','Oylamada en yüksek oy eşit çıktı.'));
  else
   perform vk_private.apply_death(rid,target_id,'village');
   select * into p from vk_private.players where id=target_id;
   select bonus_attacks into r.bonus_attacks from vk_private.rooms where id=rid;
   r.announcement:=jsonb_build_object('kind','execution','number',p.number,'name',p.name,'text',format('%s · %s köyün kararıyla idam edildi.',p.number,p.name));
   r.events:=r.events||jsonb_build_array(jsonb_build_object('day',r.day,'text',r.announcement->>'text'));
   if p.role='jester' then r.phase:='finished'; r.winner:='jester'; dur:=0;
   elsif p.role='vampire' and not exists(select 1 from vk_private.players where room_id=rid and role in ('vampire','vampire_cub') and alive and participating and not kicked) then r.phase:='finished'; r.winner:='village'; dur:=0;
   else r.phase:='execution'; dur:=7;
   end if;
  end if;
 when 'execution' then night_next:=true;
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
  speech_order=r.speech_order,speech_turn=r.speech_turn,speech_slot_ms=r.speech_slot_ms,speech_ends_at=r.speech_ends_at where id=rid;
 perform vk_private.capture_hunter(rid);
end $$;

create or replace function public.vk_start(p_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=vk_private.require_user(); r vk_private.rooms; ids uuid[];
 idx int:=2; k text; mandatory int; drawn text[]; options text[]:=array['doctor','jester','mayor','bodyguard','hunter','shaman','gunslinger','vampire_cub'];
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
 update vk_private.players set role='villager',alive=true,self_heal_used=false,eliminated_by=null where room_id=r.id and participating and alive and not kicked;
 update vk_private.players set role='vampire' where id=ids[1];
 if coalesce((r.settings->>'two_vampires')::boolean,false) then update vk_private.players set role='vampire' where id=ids[2]; idx:=3; end if;
 select count(*) into mandatory from unnest(options) as opt(role_key) where vk_private.role_mode(r.settings,opt.role_key)='always';
 drawn:=vk_private.draw_roles(r.settings,cardinality(ids)-idx+1);
 foreach k in array drawn loop
  update vk_private.players set role=k where id=ids[idx]; idx:=idx+1;
 end loop;
 update vk_private.rooms set role_pool_overflow=mandatory+case when coalesce((r.settings->>'two_vampires')::boolean,false) then 2 else 1 end>cardinality(ids) where id=r.id;
 update vk_private.rooms set phase='dealing',seq=seq+1,started_at=now(),ends_at=now()+interval '7 seconds',summary_complete=true,vote_candidates='{}' where id=r.id;
end $$;
revoke all on function vk_private.draw_roles(jsonb,int) from public,anon,authenticated;
commit;
