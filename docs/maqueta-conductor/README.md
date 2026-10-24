# RutaSegura · Maqueta "Propuesta final conductor" — spec para implementar

Prototipo navegable (HTML adjunto: `index.html`). Esta spec traduce la maqueta a lo
que hay que construir en la app del conductor (Expo / expo-router) del repo
`Ggonzav/ruta-services-school`.

## Identidad visual
- **Navy** `#1b2a5b` como color oscuro (cabeceras, texto fuerte, botón primario alterno, pines).
- **Amarillo** `#ffb703` como marca y CTA principal (texto en navy, alto contraste tipo señalética).
- Fondo app cálido-claro `#f3f6fb`; tarjetas blancas `#fff`; líneas `#e7eaf2`.
- Verde `#17a05a` para "Iniciar" y estados OK; rojo `#d64550` para "Cerrar sesión" (outline).
- Marca: **furgón navy dentro de un pin amarillo** (logo).
- OJO: en `develop` hoy la identidad quedó en **negro cálido `#1C1B17`** (PR #14).
  Esta maqueta la mueve a **navy** → cambiar el token oscuro en
  `apps/conductor/src/lib/theme.ts` y `apps/web-apoderado/public/styles.css`.

## Navegación nueva: menú lateral (drawer)
- Hamburguesa (☰) en la cabecera navy de todas las pantallas de la app.
- Ítems del drawer: **Volver al recorrido** (resaltado verde cuando hay recorrido en
  curso), Mis rutas, Mis alumnos, Invitar apoderados, Mi perfil, Ayuda, —, **Cerrar sesión**.
- Hoy la app navega con botones (expo-router). El drawer suma dependencia
  (`expo-router/drawer` + `@react-navigation/drawer`). Decisión abierta.

## Pantallas
1. **Login** — logo, "RutaSegura / Transporte Escolar", Correo, Contraseña (ojo mostrar/ocultar), CTA amarillo "Entrar". (ya existe `app/login.tsx`)
2. **Mis rutas (home)** — segment **Ida/Vuelta** funcional (activo amarillo); tarjeta de ruta ("Ruta demo", hora, Colegio→Casa) con lista de alumnos (avatar+nombre, tap → recorrido/detalle) y CTA verde "Iniciar vuelta"; filas "Mis alumnos" e "Invitar apoderados". **Sin mapa aquí** (decisión tomada: en reposo no aporta). (`app/(driver)/home.tsx`)
3. **Recorrido en curso** — chips "En recorrido" / "Ubicación recibida"; **mapa en vivo** (tramo recorrido gris + tramo activo navy hacia la próxima parada, furgón, parada destino resaltada, chip "En camino a <alumno>" y ETA); stepper "1 de 2"; "ELIGE LA PRÓXIMA PARADA" con tarjeta del alumno destino ("Pendiente de subida"); nota de avance automático; CTA amarillo "Finalizar recorrido". (`app/(driver)/trip.tsx`)
   - **Mapa**: el conductor NO tiene librería de mapa (hoy solo geocodifica). Para el mapa en vivo: `react-native-maps` (nativo) o Leaflet en WebView. Decisión abierta.
4. **Mis alumnos** — buscador; tarjetas por alumno con avatar, nombre, dirección, chips **Ida/Vuelta** y datos del **apoderado** (nombre, teléfono, "✓ Acceso activado"); el **">" abre el detalle**; CTA amarillo "+ Agregar alumno". (`app/(driver)/alumnos.tsx`)
5. **Detalle de alumno** — avatar grande, nombre, dirección; sección Ruta (chips Ida/Vuelta); sección Apoderado (nombre, teléfono, "Acceso activado"); acciones **Editar / Invitar apoderado / Quitar de la ruta**. (pantalla nueva)
6. **Nuevo / Editar alumno** — MISMA pantalla en dos modos (título y precarga cambian): Nombre, Turno AM/PM, Dirección, **Punto de la parada** (buscar por dirección / mi ubicación), y **datos del apoderado: Nombre + Teléfono**. CTA amarillo "Guardar". (`app/(driver)/alumno.tsx`)
7. **Invitar apoderado** — chip del alumno; enlace `rutasegura.app/i/<token>` + Copiar; botón WhatsApp; nota "se canjea una sola vez, ligado solo a ese alumno". (hoy en `app/(driver)/compartir.tsx`)
8. **Mi perfil** — avatar con botón de **cámara**; Nombre; Teléfono; Foto (opcional); "Guardar" + confirmación "Perfil guardado"; **Cerrar sesión** (rojo outline). (`app/(driver)/perfil.tsx`)

## Mapeo a lo que ya existe (backend)
- Alta/edición + apoderado + rutas AM/PM en una transacción: RPC **`carrier_save_student_profile`** (`0014_student_profile.sql`) → tabla `student_profiles(address, lat, lng, guardian_name, guardian_phone)`.
- Bloqueo de edición durante recorrido activo: triggers de **`0013_student_admin.sql`**.
- Tarjeta del conductor que ve el apoderado: **`guardian_trip_driver`** + `carriers.photo_url` (`0015_driver_card.sql`).
- Seguimiento en vivo + estado "sin señal" + confirmaciones: web del apoderado (`app.ts`, `eta-view.ts`).

## Componentes reutilizables (sistema actual)
`apps/conductor/src/components/ui.tsx`: Screen, Card, Button (primary amarillo+navy,
success verde, danger, ghost), Field, Segment, Avatar, Badge, Chip, Snackbar. Repintar
tokens en `theme.ts` basta para que todo adopte navy+amarillo.

## Decisiones abiertas (confirmar antes de codear)
1. Navy vs negro cálido actual.
2. Drawer (dependencia de navegación) sí/no.
3. Mapa en Recorrido: `react-native-maps` vs Leaflet en WebView vs sin mapa en MVP.

(Spec generada por Claude a partir de la maqueta navegable. El HTML adjunto es la
fuente de verdad visual.)
