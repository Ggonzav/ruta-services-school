# Historial del MVP

Registrar cambios comprobables. No reconstruir entregas históricas sin evidencia.

## 2026-10-04 — Marco de trabajo

- Se define alcance, arquitectura de referencia, QA, seguridad y revisión de cambios.
- Se agregan instrucciones para agentes y plantilla de pull request.
- Validación: revisión documental y `git diff --check`; ver resultado informado en la tarea.
- Sin cambios funcionales ni despliegues. QA funcional y auditoría independiente pendientes.
- Pendiente: configurar CI/protecciones remotas y asignar revisores antes de la siguiente entrega.
- Reversión: revertir exclusivamente los cambios documentales de esta entrega.

## 2026-10-07 — CI para pull requests

- Workflow `.github/workflows/ci.yml`: checks `Tests` y `Web build` para PRs a develop/main y pushes a esas ramas. Node 22, npm ci, permisos de sólo lectura y timeout de 10 minutos.
- Verificación local: 92 tests en 13 archivos aprobados; build web aprobado usando configuración ficticia, sin secretos.
- Los archivos públicos generados se restauraron tras la verificación.
- Pendiente: ejecución en GitHub, revisión independiente y activación de protección de ramas.
- Reversión: revertir el workflow; coordinar los checks obligatorios para no bloquear PRs si se retira.

## Plantilla para próximas entradas

- Fecha / PR / commit / entorno:
- Problema y comportamiento resultante:
- Pruebas ejecutadas y evidencia:
- Revisión independiente:
- Riesgos y pendientes:
- Migraciones/configuración afectadas:
- Reversión: pasos concretos; no asumir que revertir código revierte datos.
