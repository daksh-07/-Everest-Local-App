import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptQuoteWithRecovery,QuoteAcceptanceUnconfirmedError} from '../lib/quote-acceptance.ts';

test('previously committed booking is read before any mutation',async()=>{
 let writes=0;assert.equal(await acceptQuoteWithRecovery({readBooking:async()=>'existing-booking',mutate:async()=>{writes++;return 'unexpected';}}),'existing-booking');assert.equal(writes,0);
});
test('successful acceptance returns the confirmed booking with one write',async()=>{
 let writes=0;assert.equal(await acceptQuoteWithRecovery({readBooking:async()=>null,mutate:async()=>{writes++;return 'confirmed';}}),'confirmed');assert.equal(writes,1);
});
test('failed preflight never submits a mutation',async()=>{
 let writes=0;await assert.rejects(acceptQuoteWithRecovery({readBooking:async()=>{throw new Error('permission denied');},mutate:async()=>{writes++;return 'unexpected';}}),/Reconnect before choosing/);assert.equal(writes,0);
});
test('lost response recovers the committed booking without replay',async()=>{
 let reads=0,writes=0;assert.equal(await acceptQuoteWithRecovery({readBooking:async()=>++reads===1?null:'committed',mutate:async()=>{writes++;throw new Error('Failed to fetch');}}),'committed');assert.equal(writes,1);assert.equal(reads,2);
});
test('a different winning quote recovers the same request booking',async()=>{
 let reads=0;assert.equal(await acceptQuoteWithRecovery({readBooking:async()=>++reads===1?null:'other-winner-booking',mutate:async()=>{throw new Error('This request is no longer accepting quote decisions');}}),'other-winner-booking');
});
test('missing mutation confirmation triggers authoritative recovery',async()=>{
 let reads=0;assert.equal(await acceptQuoteWithRecovery({readBooking:async()=>++reads===1?null:'committed',mutate:async()=>null}),'committed');
});
for(const unavailable of [false,true])test('uncertain response with '+(unavailable?'failed':'empty')+' verification does not replay',async()=>{
 let reads=0,writes=0;await assert.rejects(acceptQuoteWithRecovery({readBooking:async()=>{reads++;if(reads===2&&unavailable)throw new Error('offline');return null;},mutate:async()=>{writes++;throw new Error('connection reset');}}),QuoteAcceptanceUnconfirmedError);assert.equal(writes,1);assert.equal(reads,2);
});
test('hung mutation is bounded and can recover its committed booking',async()=>{
 let reads=0,writes=0;assert.equal(await acceptQuoteWithRecovery({timeoutMs:10,readBooking:async()=>++reads===1?null:'committed',mutate:()=>{writes++;return new Promise(()=>{});}}),'committed');assert.equal(writes,1);
});
test('hung reconciliation ends with check-bookings feedback, no automatic replay',async()=>{
 let reads=0,writes=0;await assert.rejects(acceptQuoteWithRecovery({timeoutMs:10,readBooking:async()=>{if(++reads===1)return null;return new Promise(()=>{});},mutate:async()=>{writes++;throw new Error('timeout');}}),QuoteAcceptanceUnconfirmedError);assert.equal(writes,1);
});
test('late mutation resolution after uncertainty cannot navigate or submit again',async()=>{
 let finish,writes=0;await assert.rejects(acceptQuoteWithRecovery({timeoutMs:10,readBooking:async()=>null,mutate:()=>{writes++;return new Promise(resolve=>{finish=resolve;});}}),QuoteAcceptanceUnconfirmedError);finish('late-booking');await Promise.resolve();assert.equal(writes,1);
});
