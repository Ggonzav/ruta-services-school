-- ============================================================================
-- 0005_grants.sql
-- Privilegios base para los roles "anon" y "authenticated" que Supabase
-- expone vía PostgREST. Se listan explícitamente (en vez de asumir los
-- defaults del proyecto) para que el esquema sea auto-contenido y
-- reproducible en un Postgres limpio (incluido el usado por los tests).
--
-- RLS sigue siendo quien decide qué fila se ve: estos GRANT sólo habilitan
-- el verbo (select/insert/...) a nivel de tabla; sin la política adecuada
-- en 0002_rls.sql, el verbo no devuelve ni modifica ninguna fila.
-- ============================================================================

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on
  public.carriers,
  public.guardians,
  public.vehicles,
  public.students,
  public.student_guardians,
  public.routes,
  public.route_stops,
  public.trips,
  public.trip_events,
  public.trip_stop_eta,
  public.absences,
  public.invites
to authenticated;

-- El rol anon no necesita privilegios de tabla propios: el flujo de
-- invitación crea primero una sesión anónima (auth.signInAnonymously()),
-- que en Supabase ya lleva el claim role=authenticated. redeem_invite()
-- se otorga a anon igualmente en 0003_invites.sql por si algún cliente
-- llegara a invocarla antes de tener sesión (falla igual, por auth.uid()
-- is null, pero no por falta de permiso de ejecución).
