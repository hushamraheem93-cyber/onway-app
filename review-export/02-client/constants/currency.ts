export const CURRENCY = {
  symbol: "د.ع",
  code: "IQD",
  name: "دينار عراقي",
};

export function formatPrice(price: number | null | undefined): string {
  return `${(price ?? 0).toLocaleString("ar-IQ")} ${CURRENCY.symbol}`;
}
