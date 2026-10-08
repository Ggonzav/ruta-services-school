# Acuerdo de trabajo del MVP

Estado: marco definido el 2026-10-04. Los controles remotos y revisiones pendientes no se consideran implementados por documentarlos.

## Objetivo y alcance

Validar que el transportista pague por permitir a las familias conocer el estado, ubicación y llegada del furgón.

Incluye inicio y cierre de ida/vuelta (AM/PM), marcas Subió/Bajó/No viaja según fase, estado/ETA/mapa/avisos básicos del apoderado, invitaciones, demo con datos de prueba, web publicada y backend Supabase con RPC y Edge Functions. Esta lista define alcance, no certifica que cada función esté validada.

Quedan fuera por ahora microservicios, app nativa de apoderado, push con la app cerrada, optimización avanzada, múltiples colegios/empresas complejos, pagos, contratos y administración completa. IA no se incorpora sin un caso de uso aprobado que aporte al objetivo.

## Ciclo de cada cambio

1. Describir problema, comportamiento esperado, criterios de aceptación y relación con el alcance. Si queda fuera, proponer una alternativa MVP y acordar el cambio de alcance antes de implementarlo.
2. Crear una rama desde la base apropiada. `develop` integra; `main` representa producción. Usar `codex/<tema>` para trabajo del agente o la convención solicitada por el equipo.
3. Implementar un cambio acotado; mantener contratos y actualizar documentación pertinente.
4. Ejecutar QA proporcional al impacto, adjuntar resultados y registrar riesgos y reversión.
5. Solicitar revisión independiente mediante PR antes de integrar. El revisor registra qué verificó y qué no pudo verificar.
6. Antes de publicar, completar controles de seguridad aplicables y autorizar el despliegue. Después, comprobar la URL pública y registrar la versión desplegada.

## Responsables y bloqueo de entrega

El autor implementa y reúne evidencia. Un revisor distinto verifica QA; una persona o agente distinto del autor revisa seguridad cuando cambia autenticación, permisos, invitaciones, datos o infraestructura. Identificar al revisor en el registro; no asumir independencia por usar otra lista.

Una falla de aislamiento, un secreto expuesto o un hallazgo Alto sin resolver bloquean la publicación. Un pendiente obligatorio mantiene la entrega pendiente. Para controles no aplicables, registrar motivo. Los riesgos Medio/Bajo requieren responsable, decisión y seguimiento.

## Trazabilidad

Cada PR debe indicar problema, cambios, pruebas, riesgos y reversión. Usar commits descriptivos y migraciones numeradas nuevas; no reescribir migraciones ya aplicadas. No versionar secretos ni datos personales de prueba. Actualizar arquitectura y deploy cuando corresponda.

Configuración exigida en GitHub: protección de `main` y `develop`, PR obligatorio, una aprobación independiente, conversaciones resueltas y checks `Tests` y `Web build` de GitHub Actions aprobados con la rama actualizada. Incluye administradores y bloquea force push y borrado. Consultar el historial y GitHub para el estado efectivo; el workflow debe estar incorporado en las ramas para aplicarse a futuros cambios.

## Regla operativa

Antes de implementar, revisar alcance. Antes de cerrar, pasar QA. Antes de publicar, revisar seguridad.
