import { supabase, requireSupabaseConfig } from '@/lib/supabase';

export type AdminResourceKey =
  | 'profiles' | 'businesses' | 'business_verifications' | 'driver_applications' | 'service_requests'
  | 'quotes' | 'bookings' | 'products' | 'inventory' | 'orders' | 'payments' | 'payouts'
  | 'deliveries' | 'delivery_assignments' | 'posts' | 'post_media' | 'reviews' | 'conversations'
  | 'notifications' | 'audit_logs' | 'admin_actions' | 'categories' | 'service_definitions'
  | 'service_areas' | 'service_matches' | 'opportunities' | 'stripe_events';

export type AdminResource = { key: AdminResourceKey; label: string; table: string; select: string; searchColumn: string; orderColumn: string; description: string; sensitive?: boolean };

export const ADMIN_RESOURCES: AdminResource[] = [
  {key:'profiles',label:'Users / Profiles',table:'profiles',select:'id,role,full_name,phone,suburb,city,state,created_at,updated_at',searchColumn:'full_name',orderColumn:'created_at',description:'Customer, business and driver profile records.'},
  {key:'businesses',label:'Businesses',table:'businesses',select:'id,name,slug,status,verification_status,suburb,city,state,created_at,updated_at',searchColumn:'name',orderColumn:'created_at',description:'Business lifecycle, status and marketplace presence.'},
  {key:'business_verifications',label:'Business Verification',table:'business_verifications',select:'id,business_id,status,abn,submitted_by,reviewed_by,reviewed_at,created_at,verification_provider,provider_status,provider_entity_name,provider_match,provider_retrieved_at',searchColumn:'abn',orderColumn:'created_at',description:'Verification submissions and provider results; no raw provider credentials.'},
  {key:'driver_applications',label:'Drivers',table:'driver_applications',select:'id,user_id,suburb,city,state,availability,status,submitted_at,reviewed_at,reviewed_by,status_reason,compliance_jurisdiction,created_at,updated_at',searchColumn:'suburb',orderColumn:'created_at',description:'Driver applications and operational status.'},
  {key:'service_requests',label:'Service Requests',table:'service_requests',select:'id,customer_id,category_id,service_id,suburb,city,state,preferred_date,budget,status,delivery_mode,created_at,updated_at',searchColumn:'suburb',orderColumn:'created_at',description:'Customer demand entering the matching and quoting workflow.'},
  {key:'quotes',label:'Quotes',table:'quotes',select:'id,request_id,business_id,customer_id,service_id,price,deposit,total,proposed_date,proposed_time,valid_until,status,created_at,updated_at',searchColumn:'status',orderColumn:'created_at',description:'Quote lifecycle and commercial values.'},
  {key:'bookings',label:'Bookings',table:'bookings',select:'id,request_id,quote_id,customer_id,business_id,price,scheduled_date,scheduled_time,status,completed_at,created_at,updated_at',searchColumn:'status',orderColumn:'created_at',description:'Service booking lifecycle.'},
  {key:'products',label:'Products',table:'products',select:'id,business_id,name,slug,price,sale_price,sku,status,delivery_eligible,pickup_available,created_at,updated_at',searchColumn:'name',orderColumn:'created_at',description:'Real product catalogue records.'},
  {key:'inventory',label:'Inventory',table:'inventory',select:'product_id,stock_quantity,reserved_quantity,low_stock_threshold,updated_at',searchColumn:'product_id',orderColumn:'updated_at',description:'Stock and reservation state.'},
  {key:'orders',label:'Orders',table:'orders',select:'id,order_number,customer_id,business_id,status,payment_status,subtotal,delivery_fee,marketplace_fee,tax,total,delivery_method,created_at,updated_at',searchColumn:'order_number',orderColumn:'created_at',description:'Commerce order lifecycle and financial totals.'},
  {key:'payments',label:'Payments',table:'payments',select:'id,customer_id,booking_id,order_id,provider,amount,currency,status,created_at,updated_at',searchColumn:'status',orderColumn:'created_at',description:'Payment state. Provider secrets, tokens and checkout credentials are intentionally excluded.',sensitive:true},
  {key:'payouts',label:'Finance / Payouts',table:'payouts',select:'id,business_id,payment_id,gross_amount,marketplace_fee,delivery_fee,net_amount,status,created_at',searchColumn:'status',orderColumn:'created_at',description:'Business payout ledger.'},
  {key:'deliveries',label:'Deliveries',table:'deliveries',select:'id,order_id,status,fee,eta,created_at,updated_at',searchColumn:'status',orderColumn:'created_at',description:'Delivery lifecycle and ETA.'},
  {key:'delivery_assignments',label:'Delivery Assignments',table:'delivery_assignments',select:'id,delivery_id,driver_id,assigned_at,accepted_at,completed_at',searchColumn:'driver_id',orderColumn:'assigned_at',description:'Driver assignment operations.'},
  {key:'posts',label:'Social Posts',table:'posts',select:'id,author_id,business_id,caption,post_type,visibility,service_id,product_id,status,created_at,updated_at',searchColumn:'caption',orderColumn:'created_at',description:'Marketplace social content and moderation state.'},
  {key:'post_media',label:'Social Media',table:'post_media',select:'id,post_id,media_type,sort_order,created_at',searchColumn:'media_type',orderColumn:'created_at',description:'Post media metadata; private storage paths are not exposed.'},
  {key:'reviews',label:'Reviews',table:'reviews',select:'id,author_id,business_id,product_id,booking_id,order_id,rating,body,verified_transaction,created_at',searchColumn:'body',orderColumn:'created_at',description:'Customer reviews and transaction provenance.'},
  {key:'conversations',label:'Messaging',table:'conversations',select:'id,customer_id,business_id,request_id,booking_id,quote_id,created_at',searchColumn:'id',orderColumn:'created_at',description:'Conversation routing metadata; message content is not bulk-exported.'},
  {key:'notifications',label:'Notifications',table:'notifications',select:'id,user_id,kind,title,body,read_at,created_at',searchColumn:'title',orderColumn:'created_at',description:'Notification delivery state.'},
  {key:'audit_logs',label:'Audit Logs',table:'audit_logs',select:'id,actor_id,action,entity_type,entity_id,metadata,created_at',searchColumn:'action',orderColumn:'created_at',description:'Operational audit trail.',sensitive:true},
  {key:'admin_actions',label:'Admin Actions',table:'admin_actions',select:'id,admin_id,action,target_type,target_id,metadata,created_at',searchColumn:'action',orderColumn:'created_at',description:'Admin-specific sensitive action trail.',sensitive:true},
  {key:'categories',label:'Categories',table:'categories',select:'id,name,slug,parent_id,kind,active,created_at',searchColumn:'name',orderColumn:'created_at',description:'Service and product taxonomy.'},
  {key:'service_definitions',label:'Service Taxonomy',table:'service_definitions',select:'id,category_id,name,slug,description,default_delivery_mode,active,created_at,updated_at',searchColumn:'name',orderColumn:'created_at',description:'Canonical services and LOCAL / REMOTE / BOTH defaults.'},
  {key:'service_areas',label:'Service Areas',table:'service_areas',select:'id,business_id,state,city,suburb,postcode,active',searchColumn:'suburb',orderColumn:'suburb',description:'Business service coverage.'},
  {key:'service_matches',label:'Service Matching',table:'service_matches',select:'id,request_id,business_id,score,reason,created_at',searchColumn:'request_id',orderColumn:'created_at',description:'Business-request matching state.'},
  {key:'opportunities',label:'Opportunities',table:'opportunities',select:'id,request_id,business_id,status,expires_at,created_at',searchColumn:'status',orderColumn:'created_at',description:'Business opportunity distribution.'},
  {key:'stripe_events',label:'Stripe Events',table:'stripe_events',select:'event_id,event_type,status,processed_at,created_at',searchColumn:'event_type',orderColumn:'created_at',description:'Webhook processing metadata only; raw payment payloads remain restricted.',sensitive:true},
];

export function getAdminResource(key: string | undefined) { return ADMIN_RESOURCES.find((item) => item.key === key) ?? ADMIN_RESOURCES[0]; }
function safeSearch(value: string) { return value.replace(/[%_,]/g, ' ').replace(/\s+/g, ' ').trim(); }

export async function getAdminResourcePage(resource: AdminResource, page: number, pageSize: number, search: string) {
  requireSupabaseConfig();
  const from = page * pageSize;
  let query = supabase.from(resource.table).select(resource.select, { count: 'exact' }).order(resource.orderColumn, { ascending: false }).range(from, from + pageSize - 1);
  const term = safeSearch(search);
  if (term) query = query.ilike(resource.searchColumn, `%${term}%`);
  const { data, error, count } = await query;
  if (error) throw new Error('The requested admin data could not be loaded.');
  return { rows: (data ?? []) as unknown as Record<string, unknown>[], count: count ?? 0 };
}

export async function getAdminResourceCount(resource: AdminResource) {
  requireSupabaseConfig();
  const { count, error } = await supabase.from(resource.table).select('*', { count: 'exact', head: true });
  if (error) return null;
  return count ?? 0;
}
