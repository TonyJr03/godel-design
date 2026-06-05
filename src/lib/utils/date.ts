export const APP_TIME_ZONE = "America/Havana";

const APP_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("es", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: APP_TIME_ZONE,
});

export function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

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
