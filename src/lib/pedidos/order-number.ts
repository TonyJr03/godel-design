import { randomUUID } from "node:crypto";

function padDatePart(value: number): string {
  return String(value).padStart(2, "0");
}

export function generatePedidoNumber(date = new Date()): string {
  const year = date.getFullYear();
  const month = padDatePart(date.getMonth() + 1);
  const day = padDatePart(date.getDate());
  const hours = padDatePart(date.getHours());
  const minutes = padDatePart(date.getMinutes());
  const seconds = padDatePart(date.getSeconds());
  const suffix = randomUUID().slice(0, 4).toUpperCase();

  return `PED-${year}${month}${day}-${hours}${minutes}${seconds}-${suffix}`;
}
