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
  v_seat_id uuid;
  v_host_seat_id uuid;
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
      insert into public.seats (table_id, seat_number)
      values (v_table_id, j)
      returning id into v_seat_id;

      if i = 1 and j = 1 then
        v_host_seat_id := v_seat_id;
      end if;
    end loop;
  end loop;

  insert into public.rsvps (game_id, seat_id, user_id, player_name, status)
  values (v_game.id, v_host_seat_id, v_user, trim(p_host_name), 'seated');

  return jsonb_build_object(
    'id', v_game.id,
    'inviteCode', v_game.invite_code,
    'title', v_game.title
  );
end;
$$;
