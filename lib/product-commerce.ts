import * as ImagePicker from 'expo-image-picker';
import {Platform} from 'react-native';
import {supabase,requireSupabaseConfig} from './supabase';
import {userFacingError} from './errors';

export type ProductCategory={id:string;name:string;slug:string};
export type ShopProduct={id:string;business_id:string;category_id:string|null;name:string;short_description:string|null;price:number;sale_price:number|null;status:string;pickup_available:boolean;delivery_eligible:boolean;shipping_available:boolean;brand:string|null;created_at:string;business_name:string;suburb:string|null;city:string|null;state:string|null;primary_image_path:string|null;available_quantity:number;variant_count:number};
export type ProductVariant={id:string;product_id:string;title:string;option_values:Record<string,string>;price:number|null;sku:string|null;image_id:string|null;stock_quantity:number;reserved_quantity:number;low_stock_threshold:number;available:boolean;sort_order:number};
export type ProductImage={id:string;product_id:string;url:string;storage_path:string|null;sort_order:number;is_primary:boolean;variant_id:string|null};
export type ProductDetail={id:string;business_id:string;category_id:string|null;name:string;short_description:string|null;description:string|null;price:number;sale_price:number|null;status:string;condition:string|null;brand:string|null;key_features:string[];tags:string[];attributes:Record<string,unknown>;fulfillment:Record<string,unknown>;track_stock:boolean;made_to_order:boolean;delivery_eligible:boolean;pickup_available:boolean;shipping_available:boolean;shipping_fee:number|null;dispatch_days:number|null;listing_quality:number;businesses:{id:string;name:string;logo_url:string|null;verification_status:string;suburb:string|null;city:string|null;state:string|null}|null;inventory:{stock_quantity:number;reserved_quantity:number;low_stock_threshold:number}|null;product_images:ProductImage[];product_variants:ProductVariant[]};

export async function listProductCategories(){requireSupabaseConfig();const {data,error}=await supabase.from('categories').select('id,name,slug').eq('kind','PRODUCT').eq('active',true).order('name');if(error)throw new Error(userFacingError(error,'Product categories could not be loaded.'));return (data??[]) as ProductCategory[]}

export async function searchShop(input:{query?:string;categoryId?:string;businessId?:string;minPrice?:number;maxPrice?:number;pickup?:boolean;delivery?:boolean;shipping?:boolean;inStock?:boolean;limit?:number;offset?:number}={}){
 requireSupabaseConfig();const {data,error}=await supabase.rpc('shop_products',{p_query:input.query?.trim()||null,p_category_id:input.categoryId??null,p_min_price:input.minPrice??null,p_max_price:input.maxPrice??null,p_pickup:input.pickup??null,p_delivery:input.delivery??null,p_shipping:input.shipping??null,p_in_stock:input.inStock??true,p_limit:input.limit??24,p_offset:input.offset??0,p_business_id:input.businessId??null});if(error)throw new Error(userFacingError(error,'Products could not be loaded.'));return (data??[]) as ShopProduct[];
}

export async function getProductDetail(id:string):Promise<ProductDetail>{requireSupabaseConfig();const {data,error}=await supabase.from('products').select('id,business_id,category_id,name,short_description,description,price,sale_price,status,condition,brand,key_features,tags,attributes,fulfillment,track_stock,made_to_order,delivery_eligible,pickup_available,shipping_available,shipping_fee,dispatch_days,listing_quality,businesses(id,name,logo_url,verification_status,suburb,city,state),inventory(stock_quantity,reserved_quantity,low_stock_threshold),product_images(id,product_id,url,storage_path,sort_order,is_primary,variant_id),product_variants(id,product_id,title,option_values,price,sku,image_id,stock_quantity,reserved_quantity,low_stock_threshold,available,sort_order)').eq('id',id).single();if(error)throw new Error(userFacingError(error,'Product details could not be loaded.'));type RawDetail=Omit<ProductDetail,'businesses'|'inventory'>&{businesses:ProductDetail['businesses']|ProductDetail['businesses'][];inventory:ProductDetail['inventory']|ProductDetail['inventory'][]};const raw=data as unknown as RawDetail;return {...raw,businesses:Array.isArray(raw.businesses)?raw.businesses[0]??null:raw.businesses,inventory:Array.isArray(raw.inventory)?raw.inventory[0]??null:raw.inventory,product_images:[...(raw.product_images??[])].sort((a,b)=>Number(b.is_primary)-Number(a.is_primary)||a.sort_order-b.sort_order),product_variants:[...(raw.product_variants??[])].sort((a,b)=>a.sort_order-b.sort_order)} as ProductDetail}

export async function signedProductMedia(path:string|null,expires=3600){if(!path)return null;if(/^https?:\/\//i.test(path))return path;const {data,error}=await supabase.storage.from('product-media').createSignedUrl(path,expires);if(error)return null;return data.signedUrl}

export async function saveProductDetails(input:{productId:string;name:string;shortDescription:string;description:string;categoryId:string;price:number;salePrice?:number;condition?:string;brand?:string;keyFeatures:string[];tags:string[];attributes?:Record<string,unknown>;fulfillment?:Record<string,unknown>;trackStock:boolean;madeToOrder:boolean;deliveryEligible:boolean;pickupAvailable:boolean;shippingAvailable:boolean;shippingFee?:number;dispatchDays?:number;sku?:string}){
 const {data,error}=await supabase.rpc('update_product_v2',{p_product_id:input.productId,p_name:input.name.trim(),p_short_description:input.shortDescription.trim(),p_description:input.description.trim(),p_category_id:input.categoryId,p_price:input.price,p_sale_price:input.salePrice??null,p_condition:input.condition||null,p_brand:input.brand?.trim()||null,p_key_features:input.keyFeatures,p_tags:input.tags,p_attributes:input.attributes??{},p_fulfillment:input.fulfillment??{},p_track_stock:input.trackStock,p_made_to_order:input.madeToOrder,p_delivery_eligible:input.deliveryEligible,p_pickup_available:input.pickupAvailable,p_shipping_available:input.shippingAvailable,p_shipping_fee:input.shippingFee??null,p_dispatch_days:input.dispatchDays??null,p_sku:input.sku?.trim()||null});if(error)throw new Error(userFacingError(error,'Product could not be saved.'));return Boolean(data)
}

export async function saveVariant(input:{productId:string;variantId?:string;title:string;optionValues:Record<string,string>;price?:number;sku?:string;stock:number;lowStockThreshold?:number;available?:boolean;sortOrder?:number}){const {data,error}=await supabase.rpc('upsert_product_variant',{p_product_id:input.productId,p_variant_id:input.variantId??null,p_title:input.title.trim(),p_option_values:input.optionValues,p_price:input.price??null,p_sku:input.sku?.trim()||null,p_stock:input.stock,p_low_stock_threshold:input.lowStockThreshold??5,p_available:input.available??true,p_sort_order:input.sortOrder??0});if(error)throw new Error(userFacingError(error,'Product option could not be saved.'));return data as string}

export async function setVariantCartItem(productId:string,variantId:string|null,quantity:number){const {error}=await supabase.rpc('set_my_cart_item_v2',{p_product_id:productId,p_variant_id:variantId,p_quantity:quantity});if(error)throw new Error(userFacingError(error,'Unable to update your cart. Check availability and try again.'))}

function normalizeProductImageMime(asset:ImagePicker.ImagePickerAsset){
 const raw=(asset.mimeType||asset.file?.type||'').toLowerCase();
 if(raw==='image/jpg')return 'image/jpeg';
 if(['image/jpeg','image/png','image/webp','image/heic','image/heif'].includes(raw))return raw;
 const source=(asset.fileName||asset.uri||'').toLowerCase().split(/[?#]/)[0];
 if(/\.jpe?g$/.test(source))return 'image/jpeg';
 if(/\.png$/.test(source))return 'image/png';
 if(/\.webp$/.test(source))return 'image/webp';
 if(/\.heic$/.test(source))return 'image/heic';
 if(/\.heif$/.test(source))return 'image/heif';
 return 'image/jpeg';
}

async function productImageArrayBuffer(asset:ImagePicker.ImagePickerAsset){
 if(Platform.OS==='web'&&asset.file){
  const direct=await asset.file.arrayBuffer();
  if(direct.byteLength)return direct;
 }
 const response=await fetch(asset.uri);
 if(!response.ok)throw new Error('The selected photo could not be opened. Please choose it again.');
 const blob=await response.blob();
 const buffer=await blob.arrayBuffer();
 if(!buffer.byteLength)throw new Error('The selected photo is empty or could not be read.');
 return buffer;
}

export async function uploadProductImage(input:{businessId:string;productId:string;asset:ImagePicker.ImagePickerAsset;sortOrder:number;primary:boolean}){
 const a=input.asset;if(a.fileSize===0)throw new Error('This image is empty or corrupt.');if(a.fileSize&&a.fileSize>12*1024*1024)throw new Error('Image must be smaller than 12 MB.');
 const mime=normalizeProductImageMime(a);if(!['image/jpeg','image/png','image/webp','image/heic','image/heif'].includes(mime))throw new Error('Use a JPEG, PNG, WebP or HEIC image.');
 const ext=mime==='image/jpeg'?'jpg':mime.split('/')[1];const path=`${input.businessId}/${input.productId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
 const body=await productImageArrayBuffer(a);if(body.byteLength>12*1024*1024)throw new Error('Image must be smaller than 12 MB.');
 const {error:uploadError}=await supabase.storage.from('product-media').upload(path,body,{contentType:mime,cacheControl:'3600',upsert:false});if(uploadError)throw new Error(userFacingError(uploadError,'Image upload failed.'));
 const {data,error}=await supabase.from('product_images').insert({product_id:input.productId,url:path,storage_path:path,sort_order:input.sortOrder,is_primary:input.primary,mime_type:mime,width:a.width??null,height:a.height??null}).select('id,product_id,url,storage_path,sort_order,is_primary,variant_id').single();if(error){await supabase.storage.from('product-media').remove([path]);throw new Error(userFacingError(error,'Image could not be attached to the product.'))}return data as ProductImage;
}

export async function removeProductImage(image:ProductImage){const path=image.storage_path||(!/^https?:\/\//i.test(image.url)?image.url:null);const {error}=await supabase.from('product_images').delete().eq('id',image.id);if(error)throw new Error(userFacingError(error,'Image could not be removed.'));if(path)await supabase.storage.from('product-media').remove([path])}

export async function reorderProductImages(images:ProductImage[]){for(let i=0;i<images.length;i++){const {error}=await supabase.from('product_images').update({sort_order:i,is_primary:i===0}).eq('id',images[i].id);if(error)throw new Error(userFacingError(error,'Image order could not be saved.'));}}

export async function setProductInventory(productId:string,quantity:number,lowStockThreshold=5){if(!Number.isInteger(quantity)||quantity<0)throw new Error('Stock must be a whole number.');const {data,error}=await supabase.rpc('set_product_inventory',{p_product_id:productId,p_quantity:quantity,p_low_stock_threshold:lowStockThreshold});if(error)throw new Error(userFacingError(error,'Inventory could not be saved.'));return Boolean(data)}

export async function setVariantImage(variantId:string,imageId:string|null){const {data,error}=await supabase.rpc('set_product_variant_image',{p_variant_id:variantId,p_image_id:imageId});if(error)throw new Error(userFacingError(error,'Variant image could not be saved.'));return Boolean(data)}

export async function deleteVariant(variantId:string){const {error}=await supabase.from('product_variants').delete().eq('id',variantId);if(error)throw new Error(userFacingError(error,'Product option could not be removed.'))}

export async function publishProduct(productId:string){const {data,error}=await supabase.rpc('set_product_status',{p_product_id:productId,p_status:'ACTIVE'});if(error)throw new Error(userFacingError(error,'Product cannot be published yet.'));return Boolean(data)}

export async function setProductLifecycle(productId:string,status:'DRAFT'|'ACTIVE'|'PAUSED'|'ARCHIVED'){const {data,error}=await supabase.rpc('set_product_status',{p_product_id:productId,p_status:status});if(error)throw new Error(userFacingError(error,'Product status could not be updated.'));return Boolean(data)}

export async function duplicateProduct(productId:string,businessId:string){const original=await getProductDetail(productId);const {createProduct}=await import('./catalog');const copyId=await createProduct({businessId,name:original.name+' copy',description:original.description??'',categoryId:original.category_id??undefined,price:Number(original.price),salePrice:original.sale_price===null?undefined:Number(original.sale_price),deliveryEligible:original.delivery_eligible,pickupAvailable:original.pickup_available,stock:0});await saveProductDetails({productId:copyId,name:original.name+' copy',shortDescription:original.short_description??'',description:original.description??'',categoryId:original.category_id??'',price:Number(original.price),salePrice:original.sale_price===null?undefined:Number(original.sale_price),condition:original.condition??undefined,brand:original.brand??undefined,keyFeatures:original.key_features??[],tags:original.tags??[],attributes:original.attributes??{},fulfillment:original.fulfillment??{},trackStock:original.track_stock,madeToOrder:original.made_to_order,deliveryEligible:original.delivery_eligible,pickupAvailable:original.pickup_available,shippingAvailable:original.shipping_available,shippingFee:original.shipping_fee===null?undefined:Number(original.shipping_fee),dispatchDays:original.dispatch_days??undefined});return copyId}
