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
- Verificación local: 91 tests en 13 archivos aprobados sobre develop; build web aprobado. La verificación anterior de 92 tests incluía cambios de otra rama.
- Los archivos públicos generados se restauraron tras la verificación.
- La primera ejecución en GitHub detectó que faltaba instalar Expo para resolver el tsconfig de los tests del conductor. Se agregó npm ci en apps/conductor.
- GitHub Actions: Tests y Web build aprobados en la ejecución 37860530844 tras instalar dependencias del conductor.
- PR #5 abierto contra develop. La revisión independiente y el merge siguen pendientes.
- Reversión: revertir el workflow; coordinar los checks obligatorios para no bloquear PRs si se retira.

## Plantilla para próximas entradas

- Fecha / PR / commit / entorno:
- Problema y comportamiento resultante:
- Pruebas ejecutadas y evidencia:
- Revisión independiente:
- Riesgos y pendientes:
- Migraciones/configuración afectadas:
- Reversión: pasos concretos; no asumir que revertir código revierte datos.

## 2026-10-08 — Controles activados en GitHub

- Protecciones activadas en main y develop: PR, una aprobación independiente, invalidación de aprobaciones al añadir cambios, conversaciones resueltas, rama actualizada y checks Tests/Web build de GitHub Actions. Incluye administradores; force push y borrado deshabilitados.
- El workflow fue verificado en el PR #5. Falta revisión y merge para incorporarlo a develop y posteriormente a main. No se desplegó la aplicación.
