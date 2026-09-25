-- Datos ficticios para probar Furgón. Ejecutar en el SQL Editor de Supabase.
-- Se puede repetir: reutiliza los registros de demostración existentes.
begin;
do $$
declare
  v_user uuid;
  v_carrier uuid;
  v_vehicle uuid;
  v_route uuid;
  v_student uuid;
  v_kind public.route_kind;
  v_name text;
  v_seq integer;
  v_address text;
  v_lat double precision;
  v_lng double precision;
begin
  select c.user_id, c.id, v.id
    into v_user, v_carrier, v_vehicle
  from public.carriers c
  left join public.vehicles v on v.carrier_id = c.id and v.nickname = 'Furgón demo'
  order by (v.id is not null) desc, c.created_at desc
  limit 1;

  if v_carrier is null then
    raise exception 'No existe ningún conductor en public.carriers. Primero crea/inicia sesión con el usuario conductor.';
  end if;

  update public.carriers
    set full_name = coalesce(full_name, 'Gonzalo — conductor de prueba')
    where id = v_carrier;

  if v_vehicle is null then
    insert into public.vehicles (carrier_id, nickname)
      values (v_carrier, 'Furgón demo') returning id into v_vehicle;
  end if;

  foreach v_kind in array array['AM', 'PM']::public.route_kind[] loop
    select id into v_route from public.routes
      where vehicle_id = v_vehicle and kind = v_kind limit 1;
    if v_route is null then
      insert into public.routes
        (vehicle_id, kind, name, departure_time, school_name, school_lat, school_lng)
      values (v_vehicle, v_kind, 'Ruta demo ' || v_kind::text,
        case when v_kind = 'AM' then time '07:30' else time '15:30' end,
        'Colegio Centenario', -33.5106, -70.7649)
      returning id into v_route;
    else
      update public.routes
        set name = 'Ruta demo ' || v_kind::text,
            departure_time = case when v_kind = 'AM' then time '07:30' else time '15:30' end,
            school_name = 'Colegio Centenario',
            school_lat = -33.5106,
            school_lng = -70.7649
        where id = v_route;
    end if;

    v_seq := 0;
    foreach v_name in array array['Martina Demo', 'Benjamín Demo'] loop
      v_seq := v_seq + 1;
      if v_seq = 1 then
        v_address := 'Laurel 30, Maipú, Santiago';
        v_lat := -33.5020;
        v_lng := -70.7569;
      else
        v_address := 'Diego de Almagro 111, Maipú, Santiago';
        v_lat := -33.5072;
        v_lng := -70.7562;
      end if;

      select id into v_student from public.students
        where carrier_id = v_carrier and full_name = v_name limit 1;
      if v_student is null then
        insert into public.students (carrier_id, full_name)
          values (v_carrier, v_name) returning id into v_student;
      end if;
      insert into public.route_stops (route_id, student_id, seq, address, lat, lng)
        values (v_route, v_student, v_seq, v_address, v_lat, v_lng)
        on conflict (route_id, student_id) do update
          set seq = excluded.seq,
              address = excluded.address,
              lat = excluded.lat,
              lng = excluded.lng;
    end loop;
  end loop;
end;
$$;
commit;

select r.name as ruta, r.kind as turno, count(rs.id) as alumnos
from public.routes r
join public.vehicles v on v.id = r.vehicle_id
join public.carriers c on c.id = v.carrier_id
left join public.route_stops rs on rs.route_id = r.id
where v.nickname = 'Furgón demo'
group by r.id, r.name, r.kind
order by r.kind;

select
  r.name as ruta,
  r.kind as turno,
  s.full_name as alumno,
  rs.seq,
  rs.address,
  rs.lat,
  rs.lng,
  r.school_name,
  r.school_lat,
  r.school_lng
from public.routes r
join public.vehicles v on v.id = r.vehicle_id
join public.carriers c on c.id = v.carrier_id
join public.route_stops rs on rs.route_id = r.id
join public.students s on s.id = rs.student_id
where v.nickname = 'Furgón demo'
order by r.kind, rs.seq;
