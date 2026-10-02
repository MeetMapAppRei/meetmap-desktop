/** Public Stripe Payment Link. Override with VITE_TIP_PAYMENT_LINK. */
export const BUY_DEVELOPER_COFFEE_URL = String(
  import.meta.env.VITE_TIP_PAYMENT_LINK || "",
).trim();

export function shouldShowBuyDeveloperCoffee() {
  return Boolean(BUY_DEVELOPER_COFFEE_URL);
}
