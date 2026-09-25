import { describe, expect, it } from 'vitest';
import { parseStoredList, saveRedeemedStudent, upsertStudent, type RedeemedStudent } from './local-students.js';

const martina: RedeemedStudent = {
  studentId: 'martina',
  studentName: 'Martina R.',
  routeName: 'Ruta de la mañana',
  schoolName: 'Colegio Los Aromos',
  redeemedAt: '2026-01-01T00:00:00Z',
};
const benjamin: RedeemedStudent = { ...martina, studentId: 'benjamin', studentName: 'Benjamín T.' };

describe('upsertStudent', () => {
  it('agrega un alumno nuevo al principio de la lista', () => {
    expect(upsertStudent([], martina)).toEqual([martina]);
    expect(upsertStudent([martina], benjamin)).toEqual([benjamin, martina]);
  });

  it('re-canjear el mismo alumno actualiza su fila en vez de duplicarla', () => {
    const updated = { ...martina, studentName: 'Martina Renombrada' };
    const result = upsertStudent([martina, benjamin], updated);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(updated);
  });
});

describe('parseStoredList', () => {
  it('localStorage vacío da lista vacía, no un error', () => {
    expect(parseStoredList(null)).toEqual([]);
  });

  it('JSON corrupto da lista vacía en vez de tirar la página abajo', () => {
    expect(parseStoredList('{esto no es json')).toEqual([]);
  });

  it('un JSON que no es array (dato viejo/corrupto) también da lista vacía', () => {
    expect(parseStoredList('{"a":1}')).toEqual([]);
  });
});

describe('saveRedeemedStudent (con un storage fake)', () => {
  it('persiste y se puede releer', () => {
    const store = new Map<string, string>();
    const fakeStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };

    saveRedeemedStudent(martina, fakeStorage);
    const result = saveRedeemedStudent(benjamin, fakeStorage);

    expect(result.map((s) => s.studentId)).toEqual(['benjamin', 'martina']);
  });
});
