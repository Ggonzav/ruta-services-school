import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import type { RouteKind } from '../../../../shared/rutasegura-api';
import { supabase } from '@/lib/supabase';
import {
  fetchCarrierRouteIdByKind,
  saveStudentProfile,
} from '@/lib/tripApi';
import { colors, radius, typography } from '@/lib/theme';
import { Button, Card, ErrorText, Field, Loading, Screen, Spacer } from '@/components/ui';
import { DriverHeader } from '@/components/driver-shell';

interface KindAssignment {
  routeId: string;
  address: string;
  lat: number;
  lng: number;
}

// Alta / edición de un alumno y su parada en un turno (AM o PM). La
// coordenada se fija geocodificando la dirección o usando la ubicación
// actual del teléfono (expo-location); no hay librería de mapa nativa.
export default function AlumnoScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const studentId = typeof params.id === 'string' ? params.id : null;
  const isEdit = !!studentId;

  const [loading, setLoading] = useState(isEdit);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState({ AM: true, PM: true });
  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const addressVersion = useRef(0);
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [byKind, setByKind] = useState<Partial<Record<RouteKind, KindAssignment>>>({});
  const [resolving, setResolving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('students')
        .select('full_name, student_profiles(*), route_stops(route_id, address, lat, lng, routes(kind))')
        .eq('id', studentId)
        .maybeSingle();
      if (!data) {
        setError('No encontramos a este alumno.');
        return;
      }
      setName(data.full_name);
      const map: Partial<Record<RouteKind, KindAssignment>> = {};
      for (const rs of (data as any).route_stops ?? []) {
        const k = (Array.isArray(rs.routes) ? rs.routes[0]?.kind : rs.routes?.kind) as RouteKind | undefined;
        if (k) map[k] = { routeId: rs.route_id, address: rs.address, lat: rs.lat, lng: rs.lng };
      }
      setByKind(map);
      const raw = (data as any).student_profiles;
      const profile = Array.isArray(raw) ? raw[0] : raw;
      const home = profile ?? map.AM ?? map.PM;
      setAddress(home?.address ?? '');
      setCoords(home ? { lat: home.lat, lng: home.lng } : null);
      setGuardianName(profile?.guardian_name ?? '');
      setGuardianPhone(profile?.guardian_phone ?? '');
      setSelected({ AM: !!map.AM, PM: !!map.PM });
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function geocodeFromAddress() {
    if (!address.trim()) {
      setError('Escribe la dirección antes de buscar el punto.');
      return;
    }
    setError(null);
    setResolving(true);
    const version = addressVersion.current;
    try {
      const results = await Location.geocodeAsync(address.trim());
      if (results.length === 0) {
        setError('No encontramos esa dirección. Ajusta el texto o usa tu ubicación actual.');
        return;
      }
      if (version !== addressVersion.current) return;
      setCoords({ lat: results[0].latitude, lng: results[0].longitude });
    } catch {
      setError('No pudimos buscar la dirección. Intenta con tu ubicación actual.');
    } finally {
      setResolving(false);
    }
  }

  async function useCurrentLocation() {
    setError(null);
    setResolving(true);
    const version = addressVersion.current;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Activa el permiso de ubicación para fijar el punto con tu posición.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (version !== addressVersion.current) return;
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch {
      setError('No pudimos obtener tu ubicación. Intenta geocodificar la dirección.');
    } finally {
      setResolving(false);
    }
  }

  function friendlyError(message: string): string {
    if (message.includes('route_has_active_trip') || message.includes('student_has_active_trip')) {
      return 'Hay un recorrido en curso: no puedes cambiar alumnos ni paradas hasta finalizarlo.';
    }
    if (message.includes('profile_fields_required')) return 'Completa el nombre, dirección y datos del apoderado.';
    if (message.includes('full_name_required')) return 'El nombre no puede quedar vacío.';
    if (message.includes('invalid_coordinates')) return 'La coordenada no es válida. Vuelve a fijar el punto.';
    return message;
  }

  async function handleSave() {
    if (!guardianName.trim() || !guardianPhone.trim()) return setError('Ingresa nombre y teléfono del apoderado.');
    if (!name.trim()) return setError('El nombre es obligatorio.');
    if (!address.trim()) return setError('La dirección es obligatoria.');
    if (!coords) return setError('Fija el punto: busca por dirección o usa tu ubicación actual.');
    setError(null);
    setSaving(true);
    try {
      const amRoute = selected.AM ? byKind.AM?.routeId ?? await fetchCarrierRouteIdByKind('AM') : null;
      const pmRoute = selected.PM ? byKind.PM?.routeId ?? await fetchCarrierRouteIdByKind('PM') : null;
      if ((selected.AM && !amRoute) || (selected.PM && !pmRoute)) {
        setError('No hay una ruta única configurada para el trayecto seleccionado.');
        return;
      }
      await saveStudentProfile({ studentId, name, address, ...coords, guardianName, guardianPhone, amRoute, pmRoute });
      router.replace('/(driver)/alumnos');
    } catch (e) {
      setError(friendlyError(e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loading />;

  return (
    <Screen>
      <DriverHeader />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text
          onPress={() => router.replace('/(driver)/alumnos')}
          style={{ fontSize: 16, fontWeight: '700', color: colors.text }}
        >
          ← Volver
        </Text>
      </View>
      <View>
        <Text style={typography.h2}>{isEdit ? 'Editar alumno' : 'Nuevo alumno'}</Text>
      </View>

      <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
        <Field label="Nombre completo" placeholder="Nombre y apellido" value={name} onChangeText={setName} />

        <Field label="Dirección de la casa" placeholder="Calle, número y comuna" value={address}
          onChangeText={(value) => { addressVersion.current++; setAddress(value); setCoords(null); }} />
        <Text style={typography.small}>La misma dirección se utiliza para la ida y el regreso.</Text>
        <View style={{ gap: 12 }}>
          {(['AM', 'PM'] as const).map(k => (
            <Pressable key={k} accessibilityRole="checkbox" accessibilityState={{ checked: selected[k] }}
              onPress={() => setSelected(prev => ({ ...prev, [k]: !prev[k] }))}>
              <Text style={typography.label}>{selected[k] ? '☑' : '☐'} {k === 'AM' ? 'Ida al colegio' : 'Vuelta a casa'}</Text>
            </Pressable>
          ))}
          <Text style={typography.small}>Desmarca un trayecto para retirar al alumno de esa ruta.</Text>
        </View>
        <Field label="Nombre del apoderado" value={guardianName} onChangeText={setGuardianName} />
        <Field label="Teléfono del apoderado" placeholder="+56 9 …" keyboardType="phone-pad" value={guardianPhone} onChangeText={setGuardianPhone} />
        <Text style={typography.small}>Guarda sus datos de contacto y luego comparte la invitación para activar su acceso.</Text>

        <Card style={{ gap: 12 }}>
          <Text style={typography.label}>PUNTO DE LA PARADA</Text>
          <Text style={typography.small}>
            {coords
              ? `Punto fijado: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
              : 'Aún sin fijar. Búscalo por la dirección o usa tu ubicación actual.'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button
              title="Buscar por dirección"
              variant="ghost"
              size="md"
              onPress={geocodeFromAddress}
              loading={resolving}
              style={{ flex: 1 }}
            />
            <Button
              title="Mi ubicación"
              variant="ghost"
              size="md"
              onPress={useCurrentLocation}
              loading={resolving}
              style={{ flex: 1 }}
            />
          </View>
        </Card>

        {error && <ErrorText>{error}</ErrorText>}

        <Button title={isEdit ? 'Guardar cambios' : 'Guardar alumno'} onPress={handleSave} loading={saving} disabled={resolving} />
      </ScrollView>
      <Spacer />
    </Screen>
  );
}
