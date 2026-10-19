# GPS y web local — 2026-10-14

Rama: `codex/pr8-review`, base `f93abbe`. Autor: Codex. Entorno: macOS, Node 22.23.1. Revisión independiente: PENDIENTE (estas pruebas del autor no la reemplazan).

## Alcance y aceptación

Capturar una posición al iniciar/reanudar, sin esperar movimiento; reintentar fallos sin conservar coordenadas antiguas; confirmar recepción sólo tras `update-eta` con `ok: true`; quitar la confirmación al fallar o vencer la posición. Preparar web local con los campos públicos de Supabase y Mapbox sin imprimir valores ni modificar la fuente. No cambia RLS, RPC, Edge, migraciones ni push.

Antes: el primer envío dependía del evento nativo; el reloj de 30 segundos se adelantaba antes de conocer el resultado; los errores se ocultaban en un warning; el texto “GPS activo” era fijo y la navegación ocurría antes de terminar los permisos.

Ahora: captura inmediata tras registrar el seguimiento. Captura y petición tienen límites separados de 15 segundos; una petición vencida se aborta. Un envío confirmado espera 30 segundos; un fallo habilita otro intento después de 15 segundos. La pantalla activa revisa cada 15 segundos y al volver al primer plano: el intento puede ocurrir en el siguiente tick, no exactamente a los 15 segundos. En segundo plano se usan eventos nativos, sin prometer cadencia fija de iOS. Una sola operación lógica a la vez; respuestas tardías no confirman viajes cerrados o sustituidos. Una captura nativa que vence puede completar internamente después, pero su resultado no se envía.

“Ubicación recibida” confirma respuesta de la Edge, no entrega a todos los apoderados. La confirmación vence a los 120 segundos de la captura. El estado es conservador al reiniciar JS: espera una nueva confirmación. Un fallo posterior retira el estado verde. Se descartan eventos GPS de 120 segundos o más.

## Evidencia automática

- PASS: `npm test`: 111 pruebas en 17 archivos, incluidas 10 de ubicación (primera captura, reinicio, cierre, reintentos en primer/segundo plano, respuesta sin `ok`, timeout, captura fallida, coordenadas vencidas, permisos denegados, fallo nativo, cierre durante arranque y respuesta tardía).
- PASS: `npm exec --prefix apps/conductor -- tsc --noEmit -p apps/conductor/tsconfig.json`.
- PASS: `npm exec --prefix apps/web-apoderado -- tsc --noEmit -p apps/web-apoderado/tsconfig.json`.
- PASS: `npm run build` de web con configuración pública recibida por entorno sin imprimir valores. Verificada igualdad de los tres campos públicos de esta rama. Restaurados los artefactos versionados tras comprobar el build.
- PASS: build local en `apps/web-apoderado/dist/local`, ignorado por Git. Configuración fuente intacta; Mapbox conservado. Se copian sólo supabaseUrl, supabaseAnonKey y mapboxPublicToken; no se incorpora configuración de push del otro checkout.
- PASS: HTTP 200 para `/`, `/i/validacion-local-sin-token`, `/app.js` y `/styles.css`. Esto comprueba el fallback de rutas, no canjea una invitación ni prueba el backend.
- PASS: diff sin errores de espacios ni cambios en archivos públicos versionados. No se versionan tokens.
- PENDIENTE: compilación/instalación iOS, prueba física, interfaz en dispositivos, red real, permisos reales y concurrencia remota. Este worktree todavía no tiene Pods instalados.
- NO APLICA: publicación y humo de producción; no se publicó. No hubo cambios de autorización ni contratos, pero la suite existente de RLS/autorización sí se ejecutó.

## Web local

Desde la raíz, para regenerar y servir:

```sh
npm run local --prefix apps/web-apoderado -- /Users/gegonzalezv/Downloads/furgon-mvp/apps/web-apoderado/public/config.js
```

El argumento es un archivo público local, no un token. Para sólo generar, añadir `--build-only`. El servidor usa el puerto 4173 y muestra la IP de la red; el Mac debe permanecer encendido. En esta sesión: `http://192.168.1.82:4173` (la IP puede cambiar). Si el puerto ya está ocupado por este servidor, no iniciar otro. Este servidor es exclusivamente de desarrollo en la red local.

La fuente original y `public/config.js` no se sobrescriben. El comando normal `npm run build` sigue usando variables de entorno; para esta prueba usar `npm run local` y su salida aislada. No copiar `dist/local/config.js` al repositorio.

## Validación con iPhone y dos apoderados

1. **Preparación:** Mac y navegadores de apoderados en la misma red Wi-Fi, con acceso al puerto 4173. Usar dos sesiones independientes (preferiblemente dos dispositivos o perfiles), alumnos ficticios A y B de la misma ruta e invitaciones válidas existentes. Confirmar con el responsable que el backend de prueba tiene las migraciones y la Edge correspondientes a PR #7/#8. Su estado remoto no fue comprobado aquí; si falta, registrar bloqueo sin desplegar ni reiniciar datos.
2. **iPhone conductor:** instalar un build de esta rama en el dispositivo físico. Desde `apps/conductor`, `npx expo run:ios --device` permite seleccionar el iPhone; requiere firma, herramientas iOS y Pods. También puede usarse el workspace `ios/FurgnConductor.xcworkspace` con esquema `FurgnConductor` después de instalar Pods. Confirmar que Metro usa este worktree, no el checkout original. No usar Expo Go para certificar background. Habilitar ubicación Siempre y ubicación precisa. Registrar modelo, iOS y build.
3. **Dos apoderados:** abrir en cada sesión `http://<IP-del-Mac>:4173/i/<invitación-existente>` sustituyendo sólo el origen del enlace existente; conservar la ruta `/i/...`. No publicar ni adjuntar esos enlaces en la evidencia. Canjear A en una sesión y B en la otra; verificar los nombres correctos tras recargar. No cambiar `webBaseUrl` remoto para esta prueba. Canjear/iniciar/marcar son operaciones normales que escriben datos: usar sólo los registros ficticios acordados.
4. **Primer envío, detenido:** iniciar o retomar un recorrido disponible. Antes de responder el servidor no debe aparecer verde; esperar “Ubicación recibida” sin necesidad de desplazarse. Ambos apoderados deben mostrar la ubicación fresca del mismo furgón. Registrar cuánto tarda desde inicio hasta recepción y hasta actualización de cada web. Con buena red y GPS, una espera persistente mayor de un minuto requiere investigar; no se considera éxito por ver el indicador nativo de iOS.
5. **Destino y aislamiento:** elegir A; sólo A debe ver el estado de destino actual y su ETA. B debe ver que se atienden otras paradas, sin dirección/eventos de A. Elegir B antes de marcar A y verificar el intercambio; recargar ambas webs. Marcar Subió/No viaja en AM o Bajó/No viaja en PM; comprobar que se limpia el destino atendido y no reaparece el ETA anterior.
6. **Fallo y recuperación:** con la pantalla del conductor abierta, desactivar tanto Wi-Fi como datos móviles sólo en el iPhone. No apagar la red de los apoderados. El siguiente intento fallido debe retirar la confirmación verde. Tras más de dos minutos sin posiciones frescas, las webs deben ocultar la ubicación vencida y mostrar espera de GPS. Restablecer red: debe recuperarse con una captura nueva, sin cerrar ni reiniciar el recorrido. Repetir el fallo en el primer envío sólo si hay un recorrido de prueba disponible: no resetear uno finalizado para repetirlo.
7. **Segundo plano:** con buena red, bloquear el iPhone y realizar el recorrido representativo de unos 40 minutos; un acompañante registra las observaciones de los apoderados. Incluir movimiento y paradas. Medir huecos entre posiciones, batería y recuperación al desbloquear. Los temporizadores JS no garantizan reintentos durante suspensión; si iOS deja de entregar posiciones, registrar el fallo aunque la prueba en primer plano pase. No confundir bloqueo de pantalla con cierre forzado de la app.
8. **Cierre y AM/PM:** finalizar y verificar en ambas webs, también tras recargar, que desaparecen GPS/ETA del viaje cerrado y no reaparecen por respuestas tardías. Reabrir el conductor y comprobar que no reanuda un recorrido terminado. Repetir en el otro turno con una ruta disponible, sin mezclar fechas/turnos ni borrar datos. Si ya terminó el recorrido del día, usar otro autorizado o esperar la siguiente fecha.
9. **Mapbox:** comprobar visualmente tiles y ruta con conexión; registrar errores HTTP sólo por código, sin URLs con tokens. Preservar el token no certifica sus restricciones de origen: un rechazo para la IP local queda como bloqueo de configuración, sin modificarla remotamente. La web HTTP local no sirve para certificar push ni APIs que exijan contexto seguro; push queda fuera de esta prueba.

Registrar por paso PASS/FAIL/PENDIENTE, hora de Santiago, dispositivo, duración y evidencia sin coordenadas personales, claves ni invitaciones. Pendientes: ejecución por el usuario/equipo y revisión independiente antes de integrar. No se declara aprobado el GPS físico por estas pruebas con mocks.

## Reversión

Revertir los cambios de estos archivos y reconstruir el cliente conductor; detener el servidor local. No hay migraciones ni cambios de datos/configuración remota que revertir. La reversión del cliente recuperaría el indicador fijo y la dependencia del primer evento nativo.
