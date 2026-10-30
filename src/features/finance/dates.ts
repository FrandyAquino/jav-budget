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
// Budget periods: a month ("2026-10") or a half of it ("2026-10-Q1" covers
// days 1-15, "2026-10-Q2" day 16 to the end of the month).
export type BudgetPeriod = "monthly" | "biweekly";
export function validPeriod(period: string) {
  return validMonth(period) || /^\d{4}-(0[1-9]|1[0-2])-Q[12]$/.test(period);
}
export function isHalfPeriod(period: string) {
  return period.length === 10;
}
export function periodKey(kind: BudgetPeriod = "monthly", date = today()) {
  if (kind === "monthly") return monthKey(date);
  return `${monthKey(date)}-Q${Number(date.slice(8, 10)) <= 15 ? 1 : 2}`;
}
export function periodRange(period: string): DateRange {
  const month = period.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const last = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
  if (!isHalfPeriod(period)) return { from: `${month}-01`, to: last };
  return period.endsWith("Q1")
    ? { from: `${month}-01`, to: `${month}-15` }
    : { from: `${month}-16`, to: last };
}
export function shiftPeriod(period: string, offset: number) {
  if (!isHalfPeriod(period)) return shiftMonth(period, offset);
  const index = (period.endsWith("Q2") ? 1 : 0) + offset;
  const months = Math.floor(index / 2);
  return `${shiftMonth(period.slice(0, 7), months)}-Q${index - months * 2 + 1}`;
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
