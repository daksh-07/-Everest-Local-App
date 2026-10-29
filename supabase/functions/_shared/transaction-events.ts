/** A retryable card decline must not release a still-open Checkout's reservation.
 * Success and final failure are applied by the existing idempotent database RPCs. */
export function transactionEvent(type:string,paymentStatus?:string):'success'|'failure'|'ignore'{
 if(type==='payment_intent.succeeded')return 'success';
 if(type==='checkout.session.completed'||type==='checkout.session.async_payment_succeeded')return paymentStatus==='paid'?'success':'ignore';
 if(['payment_intent.canceled','checkout.session.expired','checkout.session.async_payment_failed'].includes(type))return 'failure';
 return 'ignore';
}
