-- Mahjong Dojo MVP schema
-- Designed for Supabase Postgres. Guests join with invisible anonymous Auth sessions;
-- the invite URL is the capability that reveals a game's public details.

create extension if not exists pgcrypto;

create table public.dojos (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.dojo_members (
  dojo_id uuid not null references public.dojos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'host')),
  created_at timestamptz not null default now(),
  primary key (dojo_id, user_id)
);

create table public.dojo_host_invites (
  id uuid primary key default gen_random_uuid(),
  dojo_id uuid not null references public.dojos(id) on delete cascade,
  token text not null unique default lower(encode(gen_random_bytes(18), 'hex')),
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '30 days'),
  used_by uuid references auth.users(id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  dojo_id uuid not null references public.dojos(id) on delete cascade,
  host_id uuid not null references auth.users(id) on delete restrict,
  host_name text not null check (char_length(host_name) between 1 and 60),
  title text not null check (char_length(title) between 1 and 100),
  starts_at timestamptz not null,
  location text not null check (char_length(location) between 1 and 240),
  status text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  invite_code text not null unique default lower(encode(gen_random_bytes(12), 'hex')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index games_dojo_starts_idx on public.games (dojo_id, starts_at);
create index games_invite_code_idx on public.games (invite_code);

create table public.game_tables (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  table_number integer not null check (table_number > 0),
  created_at timestamptz not null default now(),
  unique (game_id, table_number)
);

create index game_tables_game_idx on public.game_tables (game_id, table_number);

create table public.seats (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.game_tables(id) on delete cascade,
  seat_number smallint not null check (seat_number between 1 and 4),
  unique (table_id, seat_number)
);

create index seats_table_idx on public.seats (table_id, seat_number);

create table public.rsvps (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  seat_id uuid references public.seats(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  player_name text not null check (char_length(player_name) between 1 and 60),
  status text not null check (status in ('seated', 'waitlisted', 'cancelled')),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index rsvps_game_idx on public.rsvps (game_id, status, joined_at);
create unique index rsvps_one_active_per_user
  on public.rsvps (game_id, user_id)
  where status in ('seated', 'waitlisted');
create unique index rsvps_one_active_per_seat
  on public.rsvps (seat_id)
  where status = 'seated' and seat_id is not null;

alter table public.dojos enable row level security;
alter table public.dojo_members enable row level security;
alter table public.dojo_host_invites enable row level security;
alter table public.games enable row level security;
alter table public.game_tables enable row level security;
alter table public.seats enable row level security;
alter table public.rsvps enable row level security;

-- Tables are deliberately not exposed through the Data API. All app access is via
-- narrowly-scoped RPC functions below, so an invite code never becomes a way to enumerate games.
revoke all on public.dojos from anon, authenticated;
revoke all on public.dojo_members from anon, authenticated;
revoke all on public.dojo_host_invites from anon, authenticated;
revoke all on public.games from anon, authenticated;
revoke all on public.game_tables from anon, authenticated;
revoke all on public.seats from anon, authenticated;
revoke all on public.rsvps from anon, authenticated;

create or replace function public.is_dojo_host(p_dojo_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.dojo_members dm
    where dm.dojo_id = p_dojo_id
      and dm.user_id = p_user_id
      and dm.role in ('owner', 'host')
  );
$$;

revoke all on function public.is_dojo_host(uuid, uuid) from public, anon, authenticated;

create or replace function public.get_public_game(p_invite_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_game public.games%rowtype;
  v_result jsonb;
begin
  select * into v_game
  from public.games
  where invite_code = lower(trim(p_invite_code));

  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'id', g.id,
    'dojoId', g.dojo_id,
    'dojoName', d.name,
    'title', g.title,
    'hostName', g.host_name,
    'startsAt', g.starts_at,
    'location', g.location,
    'status', g.status,
    'inviteCode', g.invite_code,
    'capacity', (select count(*) from public.seats s join public.game_tables gt on gt.id = s.table_id where gt.game_id = g.id),
    'seatedCount', (select count(*) from public.rsvps r where r.game_id = g.id and r.status = 'seated'),
    'waitlistCount', (select count(*) from public.rsvps r where r.game_id = g.id and r.status = 'waitlisted'),
    'tables', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', gt.id,
          'tableNumber', gt.table_number,
          'seats', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', s.id,
                'seatNumber', s.seat_number,
                'player', case
                  when r.id is null then null
                  else jsonb_build_object('id', r.id, 'name', r.player_name)
                end
              ) order by s.seat_number
            )
            from public.seats s
            left join public.rsvps r
              on r.seat_id = s.id
             and r.status = 'seated'
            where s.table_id = gt.id
          ), '[]'::jsonb)
        ) order by gt.table_number
      )
      from public.game_tables gt
      where gt.game_id = g.id
    ), '[]'::jsonb),
    'waitlist', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.player_name) order by r.joined_at)
      from public.rsvps r
      where r.game_id = g.id and r.status = 'waitlisted'
    ), '[]'::jsonb),
    'myRsvp', (
      select jsonb_build_object(
        'id', r.id,
        'status', r.status,
        'tableNumber', gt.table_number,
        'seatNumber', s.seat_number
      )
      from public.rsvps r
      left join public.seats s on s.id = r.seat_id
      left join public.game_tables gt on gt.id = s.table_id
      where r.game_id = g.id
        and r.user_id = auth.uid()
        and r.status in ('seated', 'waitlisted')
      limit 1
    )
  ) into v_result
  from public.games g
  join public.dojos d on d.id = g.dojo_id
  where g.id = v_game.id;

  return v_result;
end;
$$;

grant execute on function public.get_public_game(text) to anon, authenticated;

create or replace function public.create_dojo(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_dojo public.dojos%rowtype;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if char_length(trim(p_name)) < 1 then
    raise exception 'NAME_REQUIRED';
  end if;

  insert into public.dojos (name, created_by)
  values (trim(p_name), v_user)
  returning * into v_dojo;

  insert into public.dojo_members (dojo_id, user_id, role)
  values (v_dojo.id, v_user, 'owner');

  return jsonb_build_object('id', v_dojo.id, 'name', v_dojo.name, 'role', 'owner');
end;
$$;

grant execute on function public.create_dojo(text) to authenticated;

create or replace function public.create_game(
  p_dojo_id uuid,
  p_title text,
  p_host_name text,
  p_starts_at timestamptz,
  p_location text,
  p_table_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_table_id uuid;
  i integer;
  j integer;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.is_dojo_host(p_dojo_id, v_user) then raise exception 'FORBIDDEN'; end if;
  if p_table_count < 1 or p_table_count > 20 then raise exception 'INVALID_TABLE_COUNT'; end if;

  insert into public.games (dojo_id, host_id, host_name, title, starts_at, location)
  values (
    p_dojo_id,
    v_user,
    trim(p_host_name),
    trim(p_title),
    p_starts_at,
    trim(p_location)
  )
  returning * into v_game;

  for i in 1..p_table_count loop
    insert into public.game_tables (game_id, table_number)
    values (v_game.id, i)
    returning id into v_table_id;

    for j in 1..4 loop
      insert into public.seats (table_id, seat_number) values (v_table_id, j);
    end loop;
  end loop;

  return jsonb_build_object(
    'id', v_game.id,
    'inviteCode', v_game.invite_code,
    'title', v_game.title
  );
end;
$$;

grant execute on function public.create_game(uuid, text, text, timestamptz, text, integer) to authenticated;

create or replace function public.get_host_dashboard()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', d.id,
      'name', d.name,
      'role', dm.role,
      'games', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', g.id,
            'title', g.title,
            'startsAt', g.starts_at,
            'location', g.location,
            'inviteCode', g.invite_code,
            'seatedCount', (select count(*) from public.rsvps r where r.game_id = g.id and r.status = 'seated'),
            'capacity', (select count(*) from public.seats s join public.game_tables gt on gt.id = s.table_id where gt.game_id = g.id)
          ) order by g.starts_at
        )
        from public.games g
        where g.dojo_id = d.id
          and g.status <> 'cancelled'
          and g.starts_at > now() - interval '12 hours'
      ), '[]'::jsonb)
    ) order by d.name
  ), '[]'::jsonb)
  from public.dojo_members dm
  join public.dojos d on d.id = dm.dojo_id
  where dm.user_id = auth.uid();
$$;

grant execute on function public.get_host_dashboard() to authenticated;

create or replace function public.create_host_invite(p_dojo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_invite public.dojo_host_invites%rowtype;
  v_name text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  if not exists (
    select 1 from public.dojo_members
    where dojo_id = p_dojo_id and user_id = v_user and role = 'owner'
  ) then
    raise exception 'FORBIDDEN';
  end if;

  select name into v_name from public.dojos where id = p_dojo_id;

  insert into public.dojo_host_invites (dojo_id, created_by)
  values (p_dojo_id, v_user)
  returning * into v_invite;

  return jsonb_build_object('token', v_invite.token, 'dojoName', v_name, 'expiresAt', v_invite.expires_at);
end;
$$;

grant execute on function public.create_host_invite(uuid) to authenticated;

create or replace function public.get_host_invite_info(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('dojoName', d.name, 'expiresAt', i.expires_at)
  from public.dojo_host_invites i
  join public.dojos d on d.id = i.dojo_id
  where i.token = lower(trim(p_token))
    and i.used_at is null
    and i.expires_at > now();
$$;

grant execute on function public.get_host_invite_info(text) to anon, authenticated;

create or replace function public.accept_host_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_invite public.dojo_host_invites%rowtype;
  v_dojo_name text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_invite
  from public.dojo_host_invites
  where token = lower(trim(p_token))
    and used_at is null
    and expires_at > now()
  for update;

  if not found then raise exception 'INVITE_INVALID'; end if;

  insert into public.dojo_members (dojo_id, user_id, role)
  values (v_invite.dojo_id, v_user, 'host')
  on conflict (dojo_id, user_id) do nothing;

  update public.dojo_host_invites
  set used_by = v_user, used_at = now()
  where id = v_invite.id;

  select name into v_dojo_name from public.dojos where id = v_invite.dojo_id;
  return jsonb_build_object('dojoId', v_invite.dojo_id, 'dojoName', v_dojo_name);
end;
$$;

grant execute on function public.accept_host_invite(text) to authenticated;

create or replace function public.join_game(p_invite_code text, p_player_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_existing uuid;
  v_seat_id uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if char_length(trim(p_player_name)) < 1 then raise exception 'NAME_REQUIRED'; end if;

  -- Serializing joins per game makes the last-seat race impossible while keeping the
  -- implementation simple. The lock is held only for this tiny transaction.
  select * into v_game
  from public.games
  where invite_code = lower(trim(p_invite_code))
  for update;

  if not found then raise exception 'GAME_NOT_FOUND'; end if;
  if v_game.status <> 'open' then raise exception 'GAME_NOT_OPEN'; end if;

  select id into v_existing
  from public.rsvps
  where game_id = v_game.id
    and user_id = v_user
    and status in ('seated', 'waitlisted')
  limit 1;

  if v_existing is not null then
    return public.get_public_game(v_game.invite_code);
  end if;

  select s.id into v_seat_id
  from public.seats s
  join public.game_tables gt on gt.id = s.table_id
  where gt.game_id = v_game.id
    and not exists (
      select 1 from public.rsvps r
      where r.seat_id = s.id and r.status = 'seated'
    )
  order by gt.table_number, s.seat_number
  limit 1;

  if v_seat_id is null then
    insert into public.rsvps (game_id, seat_id, user_id, player_name, status)
    values (v_game.id, null, v_user, trim(p_player_name), 'waitlisted');
  else
    insert into public.rsvps (game_id, seat_id, user_id, player_name, status)
    values (v_game.id, v_seat_id, v_user, trim(p_player_name), 'seated');
  end if;

  return public.get_public_game(v_game.invite_code);
end;
$$;

grant execute on function public.join_game(text, text) to authenticated;

create or replace function public.promote_waitlist(p_game_id uuid, p_seat_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rsvp_id uuid;
begin
  select id into v_rsvp_id
  from public.rsvps
  where game_id = p_game_id and status = 'waitlisted'
  order by joined_at
  for update skip locked
  limit 1;

  if v_rsvp_id is not null then
    update public.rsvps
    set status = 'seated', seat_id = p_seat_id, updated_at = now()
    where id = v_rsvp_id;
  end if;
end;
$$;

revoke all on function public.promote_waitlist(uuid, uuid) from public, anon, authenticated;

create or replace function public.cancel_my_rsvp(p_invite_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_rsvp public.rsvps%rowtype;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_game
  from public.games
  where invite_code = lower(trim(p_invite_code))
  for update;

  if not found then raise exception 'GAME_NOT_FOUND'; end if;

  select * into v_rsvp
  from public.rsvps
  where game_id = v_game.id
    and user_id = v_user
    and status in ('seated', 'waitlisted')
  for update;

  if found then
    update public.rsvps
    set status = 'cancelled', seat_id = null, updated_at = now()
    where id = v_rsvp.id;

    if v_rsvp.status = 'seated' and v_rsvp.seat_id is not null then
      perform public.promote_waitlist(v_game.id, v_rsvp.seat_id);
    end if;
  end if;

  return public.get_public_game(v_game.invite_code);
end;
$$;

grant execute on function public.cancel_my_rsvp(text) to authenticated;

create or replace function public.get_host_game(p_game_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_dojo_id uuid;
  v_invite_code text;
begin
  select dojo_id, invite_code into v_dojo_id, v_invite_code
  from public.games where id = p_game_id;

  if v_dojo_id is null or not public.is_dojo_host(v_dojo_id, auth.uid()) then
    raise exception 'FORBIDDEN';
  end if;

  return public.get_public_game(v_invite_code);
end;
$$;

grant execute on function public.get_host_game(uuid) to authenticated;

create or replace function public.add_game_table(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.games%rowtype;
  v_table_id uuid;
  v_number integer;
  i integer;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or not public.is_dojo_host(v_game.dojo_id, auth.uid()) then raise exception 'FORBIDDEN'; end if;

  select coalesce(max(table_number), 0) + 1 into v_number
  from public.game_tables where game_id = p_game_id;

  if v_number > 20 then raise exception 'TABLE_LIMIT'; end if;

  insert into public.game_tables (game_id, table_number)
  values (p_game_id, v_number)
  returning id into v_table_id;

  for i in 1..4 loop
    insert into public.seats (table_id, seat_number) values (v_table_id, i);
  end loop;

  -- Fill newly-created seats from the waitlist immediately.
  for i in 1..4 loop
    perform public.promote_waitlist(
      p_game_id,
      (select id from public.seats where table_id = v_table_id and seat_number = i)
    );
  end loop;

  return public.get_public_game(v_game.invite_code);
end;
$$;

grant execute on function public.add_game_table(uuid) to authenticated;

create or replace function public.remove_last_game_table(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.games%rowtype;
  v_table public.game_tables%rowtype;
  v_count integer;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or not public.is_dojo_host(v_game.dojo_id, auth.uid()) then raise exception 'FORBIDDEN'; end if;

  select count(*) into v_count from public.game_tables where game_id = p_game_id;
  if v_count <= 1 then raise exception 'AT_LEAST_ONE_TABLE'; end if;

  select * into v_table
  from public.game_tables
  where game_id = p_game_id
  order by table_number desc
  limit 1
  for update;

  if exists (
    select 1
    from public.rsvps r
    join public.seats s on s.id = r.seat_id
    where s.table_id = v_table.id and r.status = 'seated'
  ) then
    raise exception 'TABLE_NOT_EMPTY';
  end if;

  delete from public.game_tables where id = v_table.id;
  return public.get_public_game(v_game.invite_code);
end;
$$;

grant execute on function public.remove_last_game_table(uuid) to authenticated;

create or replace function public.move_rsvp_to_table(p_game_id uuid, p_rsvp_id uuid, p_target_table_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.games%rowtype;
  v_rsvp public.rsvps%rowtype;
  v_target_seat uuid;
  v_old_seat uuid;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or not public.is_dojo_host(v_game.dojo_id, auth.uid()) then raise exception 'FORBIDDEN'; end if;

  if not exists (select 1 from public.game_tables where id = p_target_table_id and game_id = p_game_id) then
    raise exception 'INVALID_TABLE';
  end if;

  select * into v_rsvp
  from public.rsvps
  where id = p_rsvp_id and game_id = p_game_id and status in ('seated', 'waitlisted')
  for update;

  if not found then raise exception 'RSVP_NOT_FOUND'; end if;
  v_old_seat := v_rsvp.seat_id;

  select s.id into v_target_seat
  from public.seats s
  where s.table_id = p_target_table_id
    and not exists (select 1 from public.rsvps r where r.seat_id = s.id and r.status = 'seated')
  order by s.seat_number
  limit 1;

  if v_target_seat is null then raise exception 'TABLE_FULL'; end if;

  update public.rsvps
  set seat_id = v_target_seat, status = 'seated', updated_at = now()
  where id = v_rsvp.id;

  if v_old_seat is not null and v_old_seat <> v_target_seat then
    perform public.promote_waitlist(p_game_id, v_old_seat);
  end if;

  return public.get_public_game(v_game.invite_code);
end;
$$;

grant execute on function public.move_rsvp_to_table(uuid, uuid, uuid) to authenticated;

create or replace function public.remove_rsvp(p_game_id uuid, p_rsvp_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.games%rowtype;
  v_rsvp public.rsvps%rowtype;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or not public.is_dojo_host(v_game.dojo_id, auth.uid()) then raise exception 'FORBIDDEN'; end if;

  select * into v_rsvp
  from public.rsvps
  where id = p_rsvp_id and game_id = p_game_id and status in ('seated', 'waitlisted')
  for update;

  if not found then raise exception 'RSVP_NOT_FOUND'; end if;

  update public.rsvps
  set status = 'cancelled', seat_id = null, updated_at = now()
  where id = v_rsvp.id;

  if v_rsvp.status = 'seated' and v_rsvp.seat_id is not null then
    perform public.promote_waitlist(p_game_id, v_rsvp.seat_id);
  end if;

  return public.get_public_game(v_game.invite_code);
end;
$$;

grant execute on function public.remove_rsvp(uuid, uuid) to authenticated;

create or replace function public.broadcast_rsvp_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game_id uuid;
  v_code text;
begin
  if TG_OP = 'DELETE' then v_game_id := old.game_id; else v_game_id := new.game_id; end if;
  select invite_code into v_code from public.games where id = v_game_id;
  if v_code is not null then
    perform realtime.send(jsonb_build_object('changed', true), 'game_changed', 'game:' || v_code, false);
  end if;
  return null;
end;
$$;

create or replace function public.broadcast_table_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game_id uuid;
  v_code text;
begin
  if TG_OP = 'DELETE' then v_game_id := old.game_id; else v_game_id := new.game_id; end if;
  select invite_code into v_code from public.games where id = v_game_id;
  if v_code is not null then
    perform realtime.send(jsonb_build_object('changed', true), 'game_changed', 'game:' || v_code, false);
  end if;
  return null;
end;
$$;

create or replace function public.broadcast_game_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if TG_OP = 'DELETE' then v_code := old.invite_code; else v_code := new.invite_code; end if;
  perform realtime.send(jsonb_build_object('changed', true), 'game_changed', 'game:' || v_code, false);
  return null;
end;
$$;

create trigger rsvps_broadcast_trigger
after insert or update or delete on public.rsvps
for each row execute function public.broadcast_rsvp_change();

create trigger game_tables_broadcast_trigger
after insert or update or delete on public.game_tables
for each row execute function public.broadcast_table_change();

create trigger games_broadcast_trigger
after update on public.games
for each row execute function public.broadcast_game_change();

revoke all on function public.broadcast_rsvp_change() from public, anon, authenticated;
revoke all on function public.broadcast_table_change() from public, anon, authenticated;
revoke all on function public.broadcast_game_change() from public, anon, authenticated;
