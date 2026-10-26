# Contrato de arquitectura

La fuente técnica única es [ARQUITECTURA.md](ARQUITECTURA.md). Este archivo fija los criterios de revisión; no duplica el diseño.

- Expo/React Native para conductor; web estática TypeScript para apoderado; Supabase para datos, Auth, Realtime, RPC y Edge Functions.
- Pantallas centradas en presentación. Lógica pura separada y testeable; decisiones sensibles y autorización en backend.
- RLS activo en tablas expuestas. El frontend no concede permisos. Cada operación de conductor verifica propiedad; cada lectura de apoderado respeta su vínculo con alumnos.
- Los enlaces de invitación son credenciales: no exponerlos en logs ni informes. Verificar vencimiento, canje y acceso a otros alumnos.
- Revisar cada RPC `SECURITY DEFINER`, sus permisos de ejecución, `search_path` y validaciones. Service role sólo en backend, con autorización explícita antes de operaciones privilegiadas.
- Mapbox mantiene geocodificación y cálculo de rutas/ETA. Las claves públicas de cliente no conceden privilegios de servidor; los tokens secretos nunca van a bundles. Revisar scopes y restricciones del token público de Mapbox.
- Guardar secretos sólo en configuración de servidor; las variables incorporadas al build de la web son públicas.
- Conservar la separación AM/PM, fecha de Santiago, eventos como fuente de verdad y ciclo de vida de ubicación/ETA al cerrar el viaje.

Todo cambio de estas reglas debe explicar problema, alternativas, decisión, impacto y reversión en el PR y actualizar la fuente técnica. El flujo `develop` → `main` se define en [WORKING_AGREEMENT.md](WORKING_AGREEMENT.md).
