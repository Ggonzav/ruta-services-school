# Revisión PR #7 y #8 — 2026-10-09

Estado: no publicar ni integrar esta versión. Revisión sobre PR #8 HEAD `3205a949bebbc3f3872dab7b89aec339c97104dc`, que incluye #7.

Copia aislada: `/private/tmp/rutasegura-pr8-review`. Los cambios locales de push permanecen en su carpeta original. Ninguna migración, función ni merge remoto ejecutado.

## Evidencia

- Suite original: 101/101 tests pasan.
- Build web: pasa, pero sobrescribe el bundle nuevo con la interfaz anterior. `src/app.ts` no consume `snapshot.isNext`; los textos nuevos estaban únicamente en `public/app.js`. Tras compilar desaparecen.
- Typecheck web: falla con TS18048 en `src/app.ts:257` y `:325` (`config` posiblemente undefined). No se atribuye esta falla al PR sin comparación con su base.
- Revisor independiente `/root/target_review`: prueba SQL temporal 1/1 confirma que un apoderado puede consultar `trips.target_student_id` de otro alumno y que puede volver a seleccionarse un alumno atendido.
- Proyecto Supabase vinculado: `jfjysvvrpjemcdkqutmw`, coincide con el backend de la configuración web local. No se ha acreditado un proyecto de pruebas separado.

## Correcciones necesarias

1. Llevar la nueva interfaz al fuente TypeScript y probar que recompilar conserva los estados y retira la ruta/ETA cuando cambia el destino.
2. Guardar el destino en una tabla privada o controlar su acceso desde la base. Un booleano en RPC no impide leer la columna original mediante SELECT. Probar consultas directas como apoderado, además de RPC.
3. Rechazar en la RPC la selección de alumnos ya atendidos, con validación adecuada al turno y pruebas de autorización.
4. Revisar concurrencia: una llamada update-eta que empezó antes de un cambio de destino puede terminar después e insertar un aviso para el destino anterior. La escritura debe validar el destino vigente de forma atómica; revisar también la cola de push antes del envío.

## Orden posterior

Corregir y volver a revisar los PRs; integrar localmente push 0012 y ejecutar pruebas conjuntas; confirmar el entorno remoto antes de aplicar migraciones o desplegar; luego prueba de conductor en teléfono y recepción push con página cerrada. Los PRs siguen sin merge.

## Correcciones verificadas

- PR #7: commit `4615b97`, destino privado, RPC getter del conductor, validación pendientes y persistencia atómica por revisión.
- PR #8: commit `f93abbe`, fuente web corregido, bundle regenerado y Edge adaptado; incorpora el commit corregido de #7.
- 103/103 tests; typecheck web y conductor y build web correctos. Revisor independiente `/root/target_review` repitió 4/4 tests dirigidos y no encontró bloqueantes nuevos.
- Sin despliegue ni merge a develop/main. Dispositivo, concurrencia remota y entrega push pendientes.
