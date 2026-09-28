import type { CartLine } from '@/providers/CartProvider';
import { getDeviceId } from '@/services/device';
import { requireDatabase } from '@/services/database';

export type PaymentLine = { method: string; amount: number; reference?: string };

/** Sends cart and split-payment rows to the atomic database sale function. */
export async function completeSale(input: {
  branchId: string;
  warehouseId: string;
  customerId: string | null;
  salesAgentId: string;
  items: CartLine[];
  payments: PaymentLine[];
}) {
  if (input.items.length === 0) throw new Error('Add at least one product.');
  const deviceId = await getDeviceId();
  const { data, error } = await requireDatabase().rpc('sellora_complete_sale', {
    p_branch_id: input.branchId,
    p_warehouse_id: input.warehouseId,
    p_customer_id: input.customerId,
    p_sales_agent_id: input.salesAgentId,
    p_device_id: deviceId,
    p_items: input.items.map((item) => ({
      product_id: item.productId,
      variant_id: item.variantId,
      quantity: item.quantity,
      discount_amount: item.discountAmount,
    })),
    p_payments: input.payments,
  });
  if (error) throw error;
  return data as string;
}
