/**
 * OnWay — Shared formatting utilities.
 * All date, price, phone, and text helpers live here.
 */

import { formatPrice } from "@/constants/currency";
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from "@/constants/theme";

export { formatPrice };

/** Format an ISO date string to Arabic-readable relative time. */
export function formatDate(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "الآن";
  if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
  if (diffHours < 24) return `منذ ${diffHours} ساعة`;
  if (diffDays === 1) return "أمس";
  if (diffDays < 7) return `منذ ${diffDays} أيام`;

  return date.toLocaleDateString("ar-IQ", { year: "numeric", month: "short", day: "numeric" });
}

/** Format an ISO date string to full Arabic date + time. */
export function formatDateTime(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("ar-IQ", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Format an Iraqi phone number for display: 07X XXXX XXXX */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`;
  }
  return phone;
}

/** Get the Arabic label for an order status. */
export function getStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}

/** Get the display color hex for an order status. */
export function getStatusColor(status: string): string {
  return ORDER_STATUS_COLORS[status] ?? "#9CA3AF";
}

/** Truncate a string with ellipsis. */
export function truncate(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}…`;
}

/** Convert a number to Arabic-Indic numerals. */
export function toArabicNumerals(num: number): string {
  return num.toLocaleString("ar-EG");
}

/** Calculate percentage discount. */
export function discountPercent(original: number, current: number): number {
  if (!original || original <= current) return 0;
  return Math.round(((original - current) / original) * 100);
}
