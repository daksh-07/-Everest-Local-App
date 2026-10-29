type StockPolicy={made_to_order:boolean;track_stock:boolean};
type VariantStock={available:boolean;stock_quantity:number;reserved_quantity:number};
export function canSelectVariant(product:StockPolicy,variant:VariantStock){
 return variant.available&&(product.made_to_order||!product.track_stock||variant.stock_quantity-variant.reserved_quantity>0);
}
/** Refuse truncation: the success message must match the quantity actually requested. */
export function nextCartQuantity(existing:number,added:number){
 const next=existing+added;
 return Number.isInteger(existing)&&existing>=0&&Number.isInteger(added)&&added>0&&next<=99?next:null;
}
