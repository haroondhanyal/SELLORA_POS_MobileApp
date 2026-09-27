import type { CartLine } from '@/providers/CartProvider';

export type CartTotals = { subtotal: number; discount: number; tax: number; total: number };

/** Mirrors the database price, discount and tax formula for a live cart preview. */
export function calculateCartTotals(items: CartLine[]): CartTotals {
  return items.reduce<CartTotals>((sum, item) => {
    const subtotal = Math.round(item.price * item.quantity * 100) / 100;
    const discount = Math.min(Math.max(item.discountAmount, 0), subtotal);
    const tax = Math.round(((subtotal - discount) * item.taxRate / 100) * 100) / 100;
    return { subtotal: sum.subtotal + subtotal, discount: sum.discount + discount, tax: sum.tax + tax, total: sum.total + subtotal - discount + tax };
  }, { subtotal: 0, discount: 0, tax: 0, total: 0 });
}
