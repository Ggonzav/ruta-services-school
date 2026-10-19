# Revisión independiente: push y destino elegido

Fecha: 2026-10-18. Entorno local, rama codex/web-push-alerts, cambios sin commit.
Autor: agente principal. Revisor distinto: /root/push_target_integration_review. Este registro transcribe el resultado recibido del revisor.

## Hallazgo y corrección

P2: al cambiar A → B → A, el evento approaching único impedía avisar otra vez tras descartar la entrega inicial. Corregido en 0012: unicidad por evento/dispositivo/revisión y nuevo ETA cercano de revisión vigente dispara la cola. No se revive la entrega antigua ni se modifica 0011 aplicada.

## Evidencia del revisor

28/28 pruebas aprobadas en seis archivos: push SQL13, delivery7, service worker1, cliente push5, target-view1 y target-security1. Verificó revisión antigua, distancia fuera del umbral, ausencia de aviso por mera selección, nuevo cálculo cercano, deduplicación y autorización. 0011 idéntica a f93abbe.

Resultado: corrección P2 aprobada, sin nuevos hallazgos bloqueantes en el delta revisado. No equivale a aprobación del despliegue.

## Límites y pendientes

- La autorización SQL no puede retirar una petición HTTP ya en curso o aceptada por el proveedor.
- Proveedor real, configuración remota, recepción en iPhone y humo HTTPS no ejecutados.
- No hubo publicación, merge ni modificación remota durante la revisión.

QA adicional del autor: suite completa 129/129; build web y TypeScript web/conductor aprobados antes de la última modificación exclusivamente SQL/tests/docs.
Reversión previa a activación: conservar el parche local y no desplegar. Reversión posterior: desactivar job de envío conforme a docs/PUSH.md; no reescribir migraciones aplicadas ni regenerar claves VAPID.

## 2026-10-19 — Revisión independiente del delta GPS

Revisor: /root/push_target_integration_review. Ejecutó 10/10 pruebas de ubicación aprobadas; inspeccionó ACK, frescura, retry, timeout/abort, generación y servidor local. Sin bloqueantes para PR borrador. Escaneo de patrones sin claves privadas en archivos publicables, .env.push.local ignorado. No escaneo exhaustivo de historial ni pruebas físicas. El servidor local omite VAPID pública y no certifica push.
