import { expect, it } from 'vitest';
import { tripClock } from './trip-clock';
it('keeps the Santiago day after UTC midnight', () => {
  expect(tripClock(new Date('2026-09-21T01:00:00Z'))).toEqual({ date: '2026-09-20', kind: 'PM' });
});
it('switches to the afternoon route at 13:00 in Santiago', () => {
  expect(tripClock(new Date('2026-09-20T15:59:00Z')).kind).toBe('AM');
  expect(tripClock(new Date('2026-09-20T16:00:00Z')).kind).toBe('PM');
});
