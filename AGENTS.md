# Reglas de trabajo del MVP

Antes de implementar, leer `docs/WORKING_AGREEMENT.md` y revisar el alcance.
Consultar `docs/ARQUITECTURA.md` para decisiones técnicas y `docs/DEPLOY.md` para despliegues.

- Trabajar en una rama; no implementar directamente en `main` o `develop`.
- Mantener cambios pequeños y explicitar cualquier ampliación de alcance.
- No alterar permisos, RLS o contratos RPC sin pruebas de autorización.
- Antes de cerrar, aplicar `docs/QA_CHECKLIST.md` según el impacto y registrar evidencia.
- Antes de publicar, aplicar `docs/SECURITY_REVIEW.md` y comprobar el entorno público.
- Nunca declarar como aprobada una prueba no ejecutada. Registrar pendientes y bloqueos.
- Actualizar `docs/CHANGELOG_MVP.md` cuando cambie el comportamiento o la operación.
- La revisión independiente debe hacerla alguien distinto del autor; la autoevaluación no la reemplaza.
- No publicar, hacer merge ni cambiar configuración remota por el solo hecho de seguir estas reglas.
