-- Vampir Köylü: 2026-11-01 execution voting update.
-- Run after setup.sql in the existing project's SQL Editor.
-- Replaces only the existing private phase function; preserves its ACL and all room data.
-- Execution: a unique highest vote count wins. Only tied leaders cause a runoff.
-- Early transitions still need a strict living majority; vote deadlines and all-voter waits remain.
begin;
create or replace function vk_private.advance(rid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r vk_private.rooms; alive_count int; votes_count int; needed int;
 target_id uuid; p vk_private.players; night_next boolean := false; dur int; jumped int;
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
  r.speech_turn:=r.speech_turn+jumped;
  r.speech_ends_at:=case when r.speech_turn<cardinality(r.speech_order)*2
   then r.speech_ends_at+make_interval(secs=>jumped*r.speech_slot_ms/1000.0) else null end;
  update vk_private.rooms set speech_turn=r.speech_turn,speech_ends_at=r.speech_ends_at where id=rid;
 end if;
 if r.phase in ('intro','day') and coalesce((r.settings->>'turn_based')::boolean,false) then
  while r.speech_turn<cardinality(r.speech_order)*2 and not exists(select 1 from vk_private.players where id=r.speech_order[r.speech_turn%cardinality(r.speech_order)+1] and alive and participating and not kicked) loop
   r.speech_turn:=r.speech_turn+1;
   r.speech_ends_at:=case when r.speech_turn<cardinality(r.speech_order)*2 then now()+make_interval(secs=>r.speech_slot_ms/1000.0) else null end;
  end loop;
  update vk_private.rooms set speech_turn=r.speech_turn,speech_ends_at=r.speech_ends_at where id=rid;
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
 when 'night' then
  if r.night_step='vampire' then
   if r.victim is null then return; end if;
   -- Random mode always reserves the second slot, even with no living doctor.
   -- Its duration and public phase sequence must not reveal the hidden draw.
   if vk_private.role_mode(r.settings,'doctor')='random'
      or exists(select 1 from vk_private.players where room_id=rid and alive and role='doctor') then
    r.night_step:='doctor'; dur:=(r.settings->>'night_seconds')::int;
   else r.night_step:='resolve'; end if;
  elsif r.night_step='doctor' then
   if r.protected is null and exists(select 1 from vk_private.players where room_id=rid and alive and role='doctor') then return; end if;
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
  -- Execution uses a unique plurality; the strict majority above is only for early transitions.
  with totals as (
   select target,count(*) n from vk_private.votes where room_id=rid and seq=r.seq group by target
  ), leaders as (
   select target,count(*) over () tied from totals where n=(select max(n) from totals)
  ) select target into target_id from leaders where tied=1;
  if target_id is null then
   r.phase:='runoff'; dur:=(r.settings->>'runoff_seconds')::int;
   r.announcement:=jsonb_build_object('kind','tie','text','En yüksek oyda eşitlik var. Biraz daha konuşalım; ardından oylar yeniden açılacak.');
   r.events:=r.events||jsonb_build_array(jsonb_build_object('day',r.day,'text','Oylamada en yüksek oy eşit çıktı.'));
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
 if r.phase in ('intro','day') and coalesce((r.settings->>'turn_based')::boolean,false) then
  select array_agg(id order by random()) into r.speech_order from vk_private.players where room_id=rid and alive;
  r.speech_turn:=0;
  r.speech_slot_ms:=greatest(1,floor(dur*1000.0*2/3/(cardinality(r.speech_order)*2))::int);
  r.speech_ends_at:=now()+make_interval(secs=>r.speech_slot_ms/1000.0);
 end if;
 update vk_private.rooms set phase=r.phase,seq=r.seq+1,day=r.day,started_at=now(),
  ends_at=now()+make_interval(secs=>dur),night_step=r.night_step,victim=r.victim,protected=r.protected,
  winner=r.winner,announcement=r.announcement,events=r.events,
  speech_order=r.speech_order,speech_turn=r.speech_turn,speech_slot_ms=r.speech_slot_ms,speech_ends_at=r.speech_ends_at where id=rid;
end $$;
commit;
