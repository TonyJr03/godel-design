export const APP_TIME_ZONE = "America/Havana";

const APP_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("es", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: APP_TIME_ZONE,
});

const APP_DATE_PARTS_FORMATTER = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: APP_TIME_ZONE,
});

export function formatDateOnly(date: Date): string {
  const parts = APP_DATE_PARTS_FORMATTER.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

export function addDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);

  return nextDate;
}

export function getTodayDateInputValue(date = new Date()): string {
  return formatDateOnly(date);
}

export function formatAppDateTime(
  value: string | null,
  fallback = "Sin fecha",
): string {
  if (!value) {
    return fallback;
  }

  return APP_DATE_TIME_FORMATTER.format(new Date(value));
}
