const pad = (n: number) => String(n).padStart(2, "0");

export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayIso(now: Date = new Date()): string {
  return toIsoDate(now);
}

export function monthRange(ref: Date): { from: string; to: string } {
  const first = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const last = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  return { from: toIsoDate(first), to: toIsoDate(last) };
}

export function weekRange(
  ref: Date,
  weekStartsOn: 0 | 1 = 1,
): { from: string; to: string } {
  const offset = (ref.getDay() - weekStartsOn + 7) % 7;
  const start = new Date(
    ref.getFullYear(),
    ref.getMonth(),
    ref.getDate() - offset,
  );
  const end = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate() + 6,
  );
  return { from: toIsoDate(start), to: toIsoDate(end) };
}

export function daysLeftInMonth(ref: Date): number {
  const last = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
  return last - ref.getDate() + 1;
}
