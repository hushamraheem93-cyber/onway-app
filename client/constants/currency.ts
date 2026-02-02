export const CURRENCY = {
  symbol: "د.ع",
  code: "IQD",
  name: "دينار عراقي",
};

export function formatPrice(price: number): string {
  return `${price.toLocaleString("ar-IQ")} ${CURRENCY.symbol}`;
}
