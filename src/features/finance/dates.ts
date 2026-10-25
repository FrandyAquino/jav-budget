import type { DateRange } from "./types.ts";

export function dateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function today() {
  return dateString(new Date());
}
export function monthKey(date = today()) {
  return date.slice(0, 7);
}
export function validDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T12:00:00`);
  return !Number.isNaN(d.valueOf()) && dateString(d) === date;
}
export function validMonth(month: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}
export function shiftMonth(month: string, offset: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function daysInRange(range: DateRange) {
  return (
    Math.floor(
      (Date.parse(`${range.to}T00:00:00Z`) -
        Date.parse(`${range.from}T00:00:00Z`)) /
        86400000,
    ) + 1
  );
}
export function weekStart(date: string) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dateString(d);
}
export function currentRange(mode: "week" | "month"): DateRange {
  const end = today();
  if (mode === "month") return { from: `${monthKey()}-01`, to: end };
  return { from: weekStart(end), to: end };
}
export function localTime(date = new Date()) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
