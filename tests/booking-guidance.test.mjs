import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
// Exercise the real pure guidance function without mounting native modules.
const source = fs.readFileSync('app/booking.tsx', 'utf8');
const start = source.indexOf('function nextStep('),
  end = source.indexOf('\n}\n', start) + 2;
const js = ts.transpileModule(source.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = vm.createContext({});
vm.runInContext(js, context);
test('terminal booking guidance wins over stale arrival and balance data', () => {
  for (const arrival of [null, 'ON MY WAY', 'ARRIVED']) {
    assert.equal(
      context.nextStep('COMPLETED', 50, arrival).title,
      'Job complete',
    );
    assert.equal(
      context.nextStep('CANCELLED', 50, arrival).title,
      'This booking is closed',
    );
    assert.equal(
      context.nextStep('DISPUTED', 50, arrival).title,
      'Booking under review',
    );
  }
  for (const status of [
    'REQUESTED',
    'PENDING_PAYMENT',
    'CONFIRMED',
    'UPCOMING',
    'IN_PROGRESS',
    'UNKNOWN',
  ])
    assert.notEqual(context.nextStep(status, 0, null).title, 'Job complete');
});
