import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';

export type SellableProduct = {
  productId: string;
  variantId: string | null;
  name: string;
  sku: string;
  barcode: string | null;
  categoryId: string | null;
  brandId: string | null;
  price: number;
  costPrice: number;
  taxRate: number;
  minimumStock: number;
  reorderLevel: number;
  imagePath: string | null;
  quantityAvailable: number;
};
export type CartLine = SellableProduct & { quantity: number; discountAmount: number };
type CartState = {
  items: CartLine[];
  customerId: string | null;
  salesAgentId: string | null;
  warehouseId: string | null;
  addItem: (product: SellableProduct) => void;
  setQuantity: (key: string, quantity: number) => void;
  setDiscount: (key: string, amount: number) => void;
  removeItem: (key: string) => void;
  setCustomer: (id: string | null) => void;
  setSalesAgent: (id: string | null) => void;
  setWarehouse: (id: string | null) => void;
  clearCart: () => void;
};
const CartContext = createContext<CartState | null>(null);
export const cartKey = (item: Pick<SellableProduct, 'productId' | 'variantId'>) => `${item.productId}:${item.variantId ?? 'base'}`;

/** Keeps cart state while the cashier moves across the separate POS routes. */
export function CartProvider({ children }: PropsWithChildren) {
  const [items, setItems] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [salesAgentId, setSalesAgentId] = useState<string | null>(null);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);

  function addItem(product: SellableProduct) {
    setItems((current) => {
      const key = cartKey(product);
      const match = current.find((item) => cartKey(item) === key);
      if (match) return current.map((item) => cartKey(item) === key ? { ...item, quantity: item.quantity + 1 } : item);
      return [...current, { ...product, quantity: 1, discountAmount: 0 }];
    });
  }
  function setQuantity(key: string, quantity: number) {
    if (quantity <= 0) { setItems((current) => current.filter((item) => cartKey(item) !== key)); return; }
    setItems((current) => current.map((item) => cartKey(item) === key ? { ...item, quantity } : item));
  }
  function setDiscount(key: string, amount: number) {
    setItems((current) => current.map((item) => cartKey(item) === key ? { ...item, discountAmount: amount } : item));
  }
  function clearCart() {
    setItems([]); setCustomerId(null); setSalesAgentId(null); setWarehouseId(null);
  }

  const value = useMemo(() => ({
    items, customerId, salesAgentId, warehouseId, addItem, setQuantity, setDiscount, removeItem: (key: string) => setItems((current) => current.filter((item) => cartKey(item) !== key)),
    setCustomer: setCustomerId, setSalesAgent: setSalesAgentId, setWarehouse: setWarehouseId, clearCart,
  }), [items, customerId, salesAgentId, warehouseId]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const cart = useContext(CartContext);
  if (!cart) throw new Error('useCart must be used inside CartProvider.');
  return cart;
}
