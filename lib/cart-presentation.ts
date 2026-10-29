import type {CartItem} from './commerce';
/** A missing stock read is not evidence of inventory. Server RPCs still validate under lock. */
export function cartQuantityLimit(item:CartItem){
 const p=item.products;
 if(!p||p.status!=='ACTIVE'||p.businesses?.status!=='ACTIVE'||p.businesses.verification_status!=='VERIFIED'||p.businesses.accepts_orders!==true||!p.businesses.country?.trim()||item.variant_id&&(!item.product_variants||!item.product_variants.available))return 0;
 if(p.made_to_order||p.track_stock===false)return 99;
 const stock=item.variant_id?item.product_variants:p.inventory;
 if(!stock||!Number.isFinite(stock.stock_quantity)||!Number.isFinite(stock.reserved_quantity))return 0;
 return Math.min(99,Math.max(0,stock.stock_quantity-stock.reserved_quantity));
}
export function cartNeedsAttention(item:CartItem){return !Number.isInteger(item.quantity)||item.quantity<1||item.quantity>cartQuantityLimit(item)}
