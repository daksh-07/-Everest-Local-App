export type AppRole = 'CUSTOMER' | 'BUSINESS' | 'ADMIN' | 'DELIVERY_DRIVER';
export type VerificationStatus = 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED';
export type RequestStatus = 'OPEN' | 'MATCHING' | 'QUOTING' | 'BOOKED' | 'COMPLETED' | 'CANCELLED';
export type QuoteStatus = 'DRAFT' | 'SENT' | 'VIEWED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'CANCELLED';
export type BookingStatus = 'REQUESTED' | 'PENDING_PAYMENT' | 'CONFIRMED' | 'UPCOMING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'DISPUTED';
export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'OUT_OF_STOCK' | 'PAUSED' | 'ARCHIVED';
export type OrderStatus = 'PENDING' | 'PAYMENT_CONFIRMED' | 'ACCEPTED' | 'PREPARING' | 'READY_FOR_PICKUP' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'COMPLETED' | 'CANCELLED' | 'REFUNDED';
export type PaymentStatus = 'PENDING' | 'REQUIRES_ACTION' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED' | 'PARTIALLY_REFUNDED';
export type DeliveryStatus = 'PENDING' | 'ACCEPTED' | 'PREPARING' | 'READY_FOR_PICKUP' | 'ASSIGNED' | 'PICKED_UP' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED' | 'CANCELLED';

export interface MarketplaceBusiness { id: string; name: string; slug: string; description: string | null; logo_url: string | null; category_id: string | null; verification_status: VerificationStatus; suburb: string | null; city: string | null; state: string | null; }
export interface ServiceRequest { id: string; customer_id: string; category_id: string | null; service_id: string | null; description: string; suburb: string; city: string; state: string; preferred_date: string | null; preferred_time: string | null; budget: number | null; status: RequestStatus; created_at: string; }
export interface Quote { id: string; request_id: string; business_id: string; customer_id: string; description: string; line_items: unknown[]; price: number; deposit: number; total: number; proposed_date: string | null; proposed_time: string | null; valid_until: string | null; terms: string | null; status: QuoteStatus; created_at: string; }
export interface Product { id: string; business_id: string; category_id: string | null; name: string; slug: string; description: string | null; price: number; sale_price: number | null; status: ProductStatus; delivery_eligible: boolean; pickup_available: boolean; }
