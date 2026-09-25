/** The pilot operates in Santiago; dates must not roll over at UTC midnight. */
export function tripClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const part = (name: string) => parts.find((p) => p.type === name)!.value;
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    kind: Number(part('hour')) < 13 ? 'AM' as const : 'PM' as const,
  };
}
