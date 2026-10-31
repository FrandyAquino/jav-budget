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
// Budget periods: a month ("2026-10") or a payday-to-payday half. Paydays are
// the 15th and the 30th (the last day in February): "2026-11-Q1" runs from
// Oct 30 to Nov 14, "2026-11-Q2" from Nov 15 to Nov 29.
export type BudgetPeriod = "monthly" | "biweekly";
export function validPeriod(period: string) {
  return validMonth(period) || /^\d{4}-(0[1-9]|1[0-2])-Q[12]$/.test(period);
}
export function isHalfPeriod(period: string) {
  return period.length === 10;
}
function lastDay(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}
// The month-end payday: the 30th, or the last day of shorter months.
function monthEndPayday(month: string) {
  return Math.min(30, lastDay(month));
}
function day(month: string, value: number) {
  return `${month}-${String(value).padStart(2, "0")}`;
}
export function periodKey(kind: BudgetPeriod = "monthly", date = today()) {
  const month = monthKey(date);
  if (kind === "monthly") return month;
  const d = Number(date.slice(8, 10));
  if (d >= monthEndPayday(month)) return `${shiftMonth(month, 1)}-Q1`;
  return `${month}-Q${d < 15 ? 1 : 2}`;
}
export function periodRange(period: string): DateRange {
  const month = period.slice(0, 7);
  if (!isHalfPeriod(period))
    return { from: day(month, 1), to: day(month, lastDay(month)) };
  if (period.endsWith("Q2"))
    return { from: day(month, 15), to: day(month, monthEndPayday(month) - 1) };
  const previous = shiftMonth(month, -1);
  return { from: day(previous, monthEndPayday(previous)), to: day(month, 14) };
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
