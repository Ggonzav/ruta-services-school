import { useCallback, useState } from 'react';
import { Alert, ScrollView, Share, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import type { RouteKind } from '../../../../shared/rutasegura-api';
import { supabase } from '@/lib/supabase';
import {
  assignStudentToRoute,
  createInviteLink,
  createStudent,
  fetchCarrierRouteIdByKind,
  removeStudentFromRoute,
  renameStudent,
} from '@/lib/tripApi';
import { colors, radius, typography } from '@/lib/theme';
import { Button, Card, ErrorText, Eyebrow, Field, Loading, Screen, Segment, Spacer } from '@/components/ui';

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
  const [originalName, setOriginalName] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<RouteKind>('AM');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [byKind, setByKind] = useState<Partial<Record<RouteKind, KindAssignment>>>({});
  const [resolving, setResolving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyKind = useCallback((k: RouteKind, map: Partial<Record<RouteKind, KindAssignment>>) => {
    setKind(k);
    const a = map[k];
    setAddress(a?.address ?? '');
    setCoords(a ? { lat: a.lat, lng: a.lng } : null);
  }, []);

  const load = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('students')
        .select('full_name, route_stops(route_id, address, lat, lng, routes(kind))')
        .eq('id', studentId)
        .maybeSingle();
      if (!data) {
        setError('No encontramos a este alumno.');
        return;
      }
      setName(data.full_name);
      setOriginalName(data.full_name);
      const map: Partial<Record<RouteKind, KindAssignment>> = {};
      for (const rs of (data as any).route_stops ?? []) {
        const k = (Array.isArray(rs.routes) ? rs.routes[0]?.kind : rs.routes?.kind) as RouteKind | undefined;
        if (k) map[k] = { routeId: rs.route_id, address: rs.address, lat: rs.lat, lng: rs.lng };
      }
      setByKind(map);
      applyKind(map.AM ? 'AM' : map.PM ? 'PM' : 'AM', map);
    } finally {
      setLoading(false);
    }
  }, [studentId, applyKind]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function onKindChange(k: RouteKind) {
    applyKind(k, byKind);
  }

  async function geocodeFromAddress() {
    if (!address.trim()) {
      setError('Escribe la dirección antes de buscar el punto.');
      return;
    }
    setError(null);
    setResolving(true);
    try {
      const results = await Location.geocodeAsync(address.trim());
      if (results.length === 0) {
        setError('No encontramos esa dirección. Ajusta el texto o usa tu ubicación actual.');
        return;
      }
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
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Activa el permiso de ubicación para fijar el punto con tu posición.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
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
    if (message.includes('full_name_required')) return 'El nombre no puede quedar vacío.';
    if (message.includes('invalid_coordinates')) return 'La coordenada no es válida. Vuelve a fijar el punto.';
    return message;
  }

  async function handleSave() {
    if (!name.trim()) return setError('El nombre es obligatorio.');
    if (!address.trim()) return setError('La dirección es obligatoria.');
    if (!coords) return setError('Fija el punto: busca por dirección o usa tu ubicación actual.');
    setError(null);
    setSaving(true);
    try {
      const routeId = await fetchCarrierRouteIdByKind(kind);
      if (!routeId) {
        setError(`No tienes una ruta ${kind} configurada. Pide al equipo que la cree.`);
        return;
      }
      let id = studentId;
      if (!id) {
        id = await createStudent(name.trim());
      } else if (name.trim() !== originalName) {
        await renameStudent(id, name.trim());
      }
      await assignStudentToRoute({ studentId: id, routeId, address: address.trim(), lat: coords.lat, lng: coords.lng });
      router.replace('/(driver)/alumnos');
    } catch (e) {
      setError(friendlyError(e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveFromRoute() {
    const a = byKind[kind];
    if (!studentId || !a) return;
    setError(null);
    setSaving(true);
    try {
      await removeStudentFromRoute(studentId, a.routeId);
      router.replace('/(driver)/alumnos');
    } catch (e) {
      setError(friendlyError(e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  }

  async function handleInvite() {
    if (!studentId) return;
    try {
      const webBaseUrl = (Constants.expoConfig?.extra?.webBaseUrl as string) ?? '';
      const firstName = (name || originalName).split(' ')[0];
      const { shareText } = await createInviteLink(studentId, firstName, webBaseUrl);
      await Share.share({ message: shareText });
    } catch (e) {
      Alert.alert('No se pudo crear la invitación', e instanceof Error ? e.message : String(e));
    }
  }

  if (loading) return <Loading />;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text
          onPress={() => router.replace('/(driver)/alumnos')}
          style={{ fontSize: 16, fontWeight: '700', color: colors.text }}
        >
          ← Volver
        </Text>
      </View>
      <View>
        <Eyebrow>🚌 RUTASEGURA</Eyebrow>
        <Text style={typography.h2}>{isEdit ? 'Editar alumno' : 'Nuevo alumno'}</Text>
      </View>

      <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
        <Field label="Nombre completo" placeholder="Nombre y apellido" value={name} onChangeText={setName} />

        <View style={{ gap: 6 }}>
          <Text style={typography.label}>TURNO</Text>
          <Segment
            value={kind}
            onChange={onKindChange}
            options={[
              { value: 'AM', label: 'AM · Ida' },
              { value: 'PM', label: 'PM · Vuelta' },
            ]}
          />
        </View>

        <Field label="Dirección" placeholder="Calle y número" value={address} onChangeText={setAddress} />

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

        <Button title={isEdit ? 'Guardar cambios' : 'Guardar alumno'} onPress={handleSave} loading={saving} />

        {isEdit && (
          <>
            <Button title="Invitar apoderado" variant="ghost" size="md" onPress={handleInvite} />
            {byKind[kind] && (
              <Button
                title={`Quitar de la ruta ${kind}`}
                variant="danger"
                size="md"
                onPress={handleRemoveFromRoute}
                loading={saving}
              />
            )}
          </>
        )}
      </ScrollView>
      <Spacer />
    </Screen>
  );
}
