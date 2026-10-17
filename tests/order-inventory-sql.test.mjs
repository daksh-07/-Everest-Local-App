import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const migration = readFileSync(
  'supabase/migrations/20261017071853_phase4_order_inventory_and_pickup.sql',
  'utf8',
);
// Real Postgres engine, isolated fixtures. This does not prove deployed Supabase
// RLS, Stripe, or cross-connection concurrency; no external services are called.
const schema = `
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
create type order_status as enum ('PENDING','PAYMENT_CONFIRMED','ACCEPTED','PREPARING','READY_FOR_PICKUP','OUT_FOR_DELIVERY','DELIVERED','COMPLETED','CANCELLED','REFUNDED');
create type payment_status as enum ('PENDING','SUCCEEDED','FAILED','REFUNDED','REQUIRES_ACTION');
create table businesses(id uuid primary key,status text default 'ACTIVE',verification_status text default 'VERIFIED',accepts_orders boolean default true);
create table products(id uuid primary key,business_id uuid,name text,price numeric,sale_price numeric,status text default 'ACTIVE',delivery_eligible boolean default true,pickup_available boolean default true,shipping_available boolean default true,shipping_fee numeric default 5,track_stock boolean default true,made_to_order boolean default false,updated_at timestamptz);
create table inventory(product_id uuid primary key,stock_quantity int,reserved_quantity int,updated_at timestamptz);
create table product_variants(id uuid primary key,product_id uuid,title text,option_values jsonb,price numeric,stock_quantity int,reserved_quantity int,available boolean default true,updated_at timestamptz);
create table orders(id uuid primary key default gen_random_uuid(),order_number text,customer_id uuid,business_id uuid,status order_status,payment_status payment_status,subtotal numeric,delivery_fee numeric,marketplace_fee numeric,tax numeric,total numeric,delivery_method text,delivery_address jsonb,updated_at timestamptz);
create table carts(id uuid primary key default gen_random_uuid(),customer_id uuid unique,active_checkout_order_id uuid,updated_at timestamptz);
create table cart_items(id uuid primary key default gen_random_uuid(),cart_id uuid,product_id uuid,variant_id uuid,quantity int);
create unique index cart_item_identity on cart_items(cart_id,product_id,(coalesce(variant_id,'00000000-0000-0000-0000-000000000000'::uuid)));
create function is_business_payment_ready(bid uuid) returns boolean language sql as $$ select true $$;
create table order_items(id uuid primary key default gen_random_uuid(),order_id uuid,product_id uuid,variant_id uuid,variant_snapshot jsonb,product_name text,unit_price numeric,quantity int,line_total numeric,source_cart_item_id uuid);
create table payments(id uuid primary key default gen_random_uuid(),customer_id uuid,order_id uuid,amount numeric,currency text,status payment_status,idempotency_key text,provider_checkout_session_id text,created_at timestamptz default now(),updated_at timestamptz);
create function has_business_permission(bid uuid,permission text) returns boolean language sql stable as $$ select auth.uid()='00000000-0000-0000-0000-000000000002'::uuid and bid='00000000-0000-0000-0000-000000000010'::uuid and permission='ORDERS_MANAGE' $$;
create function is_admin() returns boolean language sql stable as $$ select false $$;
-- pgcrypto's random helper is irrelevant to stock logic; use engine UUID bytes.
create function gen_random_bytes(n integer) returns bytea language sql as $$ select decode(replace(gen_random_uuid()::text,'-',''),'hex') $$;
`;
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
async function setup() {
  const db = new PGlite();
  await db.exec(schema);
  await db.exec(migration);
  await db.exec(
    `set test.uid='${id(1)}'; insert into businesses(id)values('${id(10)}'); insert into carts(id,customer_id)values('${id(20)}','${id(1)}');`,
  );
  return db;
}
async function seed(db, { mode = 'VARIANT', quantity = 2, stock = 5 } = {}) {
  await db.query(
    `insert into products(id,business_id,name,price,track_stock,made_to_order) values($1,$2,'Fixture item',10,$3,$4)`,
    [id(30), id(10), mode !== 'NONE', false],
  );
  await db.query('insert into inventory values($1,50,0,null)', [id(30)]);
  if (mode === 'VARIANT')
    await db.query(
      `insert into product_variants(id,product_id,title,price,stock_quantity,reserved_quantity)values($1,$2,'Blue',12,$3,0)`,
      [id(40), id(30), stock],
    );
  else
    await db.query(
      'update inventory set stock_quantity=$1 where product_id=$2',
      [stock, id(30)],
    );
  await db.query('insert into cart_items values($1,$2,$3,$4,$5)', [
    id(50),
    id(20),
    id(30),
    mode === 'VARIANT' ? id(40) : null,
    quantity,
  ]);
  const result = await db.query(
    `select create_order_from_cart('fixture-checkout-key-123','PICKUP',null) as result`,
  );
  return result.rows[0].result.order_id;
}
async function scalar(db, sql, params = []) {
  return (await db.query(sql, params)).rows[0];
}

test('actual checkout SQL snapshots and settles variant stock once, without touching parent stock', async () => {
  const db = await setup();
  try {
    const oid = await seed(db);
    const oi = await scalar(db, 'select * from order_items');
    assert.equal(oi.inventory_reservation, 'VARIANT');
    assert.equal(Number(oi.unit_price), 12);
    // Today's product policy is not a trustworthy record of yesterday's reservation.
    await db.exec('update products set track_stock=false');
    await db.query('select process_stripe_order_success($1)', [oid]);
    await db.query('select process_stripe_order_success($1)', [oid]);
    await db.query('select process_stripe_order_failure($1)', [oid]);
    const v = await scalar(db, 'select * from product_variants');
    assert.equal(v.stock_quantity, 3);
    assert.equal(v.reserved_quantity, 0);
    assert.equal(
      (await scalar(db, 'select * from inventory')).stock_quantity,
      50,
    );
    assert.equal(
      (await scalar(db, 'select * from orders')).payment_status,
      'SUCCEEDED',
    );
    assert.equal(
      (await scalar(db, 'select count(*)::int as n from cart_items')).n,
      0,
    );
  } finally {
    await db.close();
  }
});
test('parent stock and untracked products use their own captured reservation policy', async () => {
  for (const mode of ['PRODUCT', 'NONE']) {
    const db = await setup();
    try {
      const oid = await seed(db, { mode });
      assert.equal(
        (await scalar(db, 'select * from order_items')).inventory_reservation,
        mode,
      );
      await db.exec('update products set track_stock=true');
      await db.query('select process_stripe_order_success($1)', [oid]);
      const inv = await scalar(db, 'select * from inventory');
      assert.equal(inv.stock_quantity, mode === 'PRODUCT' ? 3 : 5);
      assert.equal(inv.reserved_quantity, 0);
    } finally {
      await db.close();
    }
  }
});
test('verified failure releases exact variant reservations once, preserves physical stock and cart items', async () => {
  const db = await setup();
  try {
    const oid = await seed(db);
    await db.query('select process_stripe_order_failure($1)', [oid]);
    await db.query('select process_stripe_order_failure($1)', [oid]);
    const v = await scalar(db, 'select * from product_variants');
    assert.equal(v.stock_quantity, 5);
    assert.equal(v.reserved_quantity, 0);
    assert.equal(
      (await scalar(db, 'select * from inventory')).reserved_quantity,
      0,
    );
    assert.equal(
      (await scalar(db, 'select count(*)::int as n from cart_items')).n,
      1,
    );
    await assert.rejects(
      db.query('select process_stripe_order_success($1)', [oid]),
      /not payable/,
    );
    await assert.rejects(db.query("select create_order_from_cart('fixture-checkout-key-123')"),/no longer pending/);
    const retry=await scalar(db,"select create_order_from_cart('fresh-after-expiry-key-123') as result");
    assert.notEqual(retry.result.order_id,oid);
    assert.equal((await scalar(db,'select * from product_variants')).reserved_quantity,2);
  } finally {
    await db.close();
  }
});
test('insufficient stock rejects checkout and invalid settlement rolls back atomically', async () => {
  const db = await setup();
  try {
    await assert.rejects(
      seed(db, { quantity: 6 }),
      /Insufficient variant stock/,
    );
    assert.equal(
      (await scalar(db, 'select count(*)::int as n from orders')).n,
      0,
    );
    await db.exec('update cart_items set quantity=2');
    const { result } = await scalar(
      db,
      `select create_order_from_cart('retry-checkout-key-123') as result`,
    );
    await db.exec('update product_variants set reserved_quantity=1');
    await assert.rejects(
      db.query('select process_stripe_order_success($1)', [result.order_id]),
      /finalization failed/,
    );
    assert.equal(
      (await scalar(db, 'select * from orders')).payment_status,
      'PENDING',
    );
    assert.equal(
      (await scalar(db, 'select * from product_variants')).stock_quantity,
      5,
    );
  } finally {
    await db.close();
  }
});
test('checkout retry reuses the pending order and exact snapshot cleanup preserves replacement cart rows', async () => {
  const db = await setup();
  try {
    const oid = await seed(db);
    const { result } = await scalar(
      db,
      `select create_order_from_cart('different-client-key-123') as result`,
    );
    assert.equal(result.order_id, oid);
    assert.equal(
      (await scalar(db, 'select * from product_variants')).reserved_quantity,
      2,
    );
    await db.exec(
      `delete from cart_items; insert into cart_items values('${id(51)}','${id(20)}','${id(30)}','${id(40)}',1)`,
    );
    await db.query('select process_stripe_order_success($1)', [oid]);
    assert.equal((await scalar(db, 'select * from cart_items')).id, id(51));
  } finally {
    await db.close();
  }
});
test('release is owned and disallowed after a hosted checkout session exists', async () => {
  const db = await setup();
  try {
    const oid = await seed(db);
    await db.exec(`set test.uid='${id(3)}'`);
    assert.equal(
      (
        await scalar(db, 'select release_my_order_reservations($1) as ok', [
          oid,
        ])
      ).ok,
      false,
    );
    await db.exec(
      `set test.uid='${id(1)}';update payments set provider_checkout_session_id='cs_fixture'`,
    );
    await assert.rejects(
      db.query('select release_my_order_reservations($1)', [oid]),
      /already in progress/,
    );
    await db.exec('update payments set provider_checkout_session_id=null');
    assert.equal(
      (
        await scalar(db, 'select release_my_order_reservations($1) as ok', [
          oid,
        ])
      ).ok,
      true,
    );
    assert.equal(
      (await scalar(db, 'select * from product_variants')).reserved_quantity,
      0,
    );
  } finally {
    await db.close();
  }
});
test('pickup completion requires merchant permission, paid pickup and ready state, and is idempotent', async () => {
  const db = await setup();
  try {
    const oid = await seed(db);
    await assert.rejects(
      db.query('select complete_pickup_order($1)', [oid]),
      /Not authorized/,
    );
    await db.exec(`set test.uid='${id(2)}'`);
    await assert.rejects(
      db.query('select complete_pickup_order($1)', [oid]),
      /Only paid pickup/,
    );
    await db.query('select process_stripe_order_success($1)', [oid]);
    await assert.rejects(
      db.query('select complete_pickup_order($1)', [oid]),
      /not ready/,
    );
    await db.exec(
      "update orders set status='READY_FOR_PICKUP',delivery_method='SHIPPING'",
    );
    await assert.rejects(
      db.query('select complete_pickup_order($1)', [oid]),
      /Only paid pickup/,
    );
    await db.exec("update orders set delivery_method='PICKUP'");
    await db.query('select complete_pickup_order($1)', [oid]);
    await db.query('select complete_pickup_order($1)', [oid]);
    assert.equal(
      (await scalar(db, 'select * from orders')).status,
      'COMPLETED',
    );
    await db.exec(`set test.uid='${id(3)}'`);
    await assert.rejects(
      db.query('select complete_pickup_order($1)', [oid]),
      /Not authorized/,
    );
    const rights = await scalar(
      db,
      `select has_function_privilege('authenticated','process_stripe_order_success(uuid)','execute') as customer,has_function_privilege('service_role','process_stripe_order_success(uuid)','execute') as service,has_function_privilege('anon','complete_pickup_order(uuid)','execute') as guest`,
    );
    assert.deepEqual(rights, { customer: false, service: true, guest: false });
  } finally {
    await db.close();
  }
});
test('migration refuses to guess reservation policy for legacy in-flight orders', async () => {
  const db = new PGlite();
  try {
    await db.exec(schema);
    await db.exec(
      "insert into orders(status,payment_status) values('PENDING','PENDING')",
    );
    await assert.rejects(
      db.exec(migration),
      /Reconcile pending product checkouts/,
    );
    await db.exec('rollback');
    const { n } = await scalar(
      db,
      `select count(*)::int as n from information_schema.columns where table_name='order_items' and column_name='inventory_reservation'`,
    );
    assert.equal(n, 0);
  } finally {
    await db.close();
  }
});

test('persisted checkout claim blocks client release and edits even before Stripe ID is saved', async () => {
  const db = await setup();
  try {
    const oid = await seed(db);
    await db.query('select claim_order_checkout($1)', [oid]);
    await db.query('select claim_order_checkout($1)', [oid]);
    await assert.rejects(
      db.query('select release_my_order_reservations($1)', [oid]),
      /already in progress/,
    );
    await assert.rejects(
      db.query('select set_my_cart_item_v2($1,$2,0)', [id(30), id(40)]),
      /already in progress/,
    );
    assert.equal(
      (await scalar(db, 'select * from product_variants')).reserved_quantity,
      2,
    );
    await db.query('select process_stripe_order_success($1)', [oid]);
    assert.equal(
      (await scalar(db, 'select * from orders')).payment_status,
      'SUCCEEDED',
    );
  } finally {
    await db.close();
  }
});
test('cart edit before provider claim cancels the old attempt and releases the exact reservation', async () => {
  const db = await setup();
  try {
    const oid = await seed(db);
    await db.query('select set_my_cart_item_v2($1,$2,1)', [id(30), id(40)]);
    assert.equal(
      (await scalar(db, 'select * from product_variants')).reserved_quantity,
      0,
    );
    assert.equal(
      (await scalar(db, 'select * from inventory')).stock_quantity,
      50,
    );
    assert.equal((await scalar(db, 'select * from cart_items')).quantity, 1);
    await assert.rejects(
      db.query('select claim_order_checkout($1)', [oid]),
      /not payable/,
    );
  } finally {
    await db.close();
  }
});

test('checkout SQL refuses zero and excessive quantities even if corrupt cart data bypassed table constraints',async()=>{for(const quantity of [0,100]){const db=await setup();try{await assert.rejects(seed(db,{quantity}),/Invalid cart quantity/);assert.equal((await scalar(db,'select count(*)::int as n from orders')).n,0)}finally{await db.close()}}});

test('rollout also blocks legacy action-required checkouts before guessing their reservation mode',async()=>{const db=new PGlite();try{await db.exec(schema);await db.exec("insert into orders(status,payment_status) values('PENDING','REQUIRES_ACTION')");await assert.rejects(db.exec(migration),/Reconcile pending product checkouts/);await db.exec('rollback')}finally{await db.close()}});
test('rollout refuses orphaned parent or variant reservations even with no pending order',async()=>{for(const variant of [false,true]){const db=new PGlite();try{await db.exec(schema);await db.exec(variant?`insert into product_variants(id,product_id,stock_quantity,reserved_quantity)values('${id(40)}','${id(30)}',5,1)`:`insert into inventory(product_id,stock_quantity,reserved_quantity)values('${id(30)}',5,1)`);await assert.rejects(db.exec(migration),/Reconcile legacy inventory reservations/);await db.exec('rollback')}finally{await db.close()}}});
