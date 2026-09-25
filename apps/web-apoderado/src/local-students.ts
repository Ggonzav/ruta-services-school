// ============================================================================
// Qué alumnos ya canjeó ESTE navegador (localStorage), para que volver a
// abrir la página (o el atajo agregado a la pantalla de inicio en iPhone)
// muestre el ETA directo, sin pedir el nombre de nuevo. Guarda sólo lo que
// hace falta para pintar la pantalla: nada sensible, y nada que no venga
// ya filtrado por RLS del lado del servidor.
//
// Funciones puras + un wrapper delgado sobre localStorage al final, para
// poder testear la parte que importa (merge, orden, "ya existe") sin un
// DOM real.
// ============================================================================

const STORAGE_KEY = 'furgon.apoderado.alumnos';

export interface RedeemedStudent {
  studentId: string;
  studentName: string;
  routeName: string;
  schoolName: string;
  redeemedAt: string; // ISO
}

/** Agrega o actualiza un alumno en la lista, más reciente primero. */
export function upsertStudent(list: RedeemedStudent[], student: RedeemedStudent): RedeemedStudent[] {
  const withoutDup = list.filter((s) => s.studentId !== student.studentId);
  return [student, ...withoutDup];
}

export function parseStoredList(raw: string | null): RedeemedStudent[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadRedeemedStudents(storage: Pick<Storage, 'getItem'> = localStorage): RedeemedStudent[] {
  return parseStoredList(storage.getItem(STORAGE_KEY));
}

export function saveRedeemedStudent(
  student: RedeemedStudent,
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage
): RedeemedStudent[] {
  const updated = upsertStudent(loadRedeemedStudents(storage), student);
  storage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}
