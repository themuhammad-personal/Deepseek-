import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const bds = path.join(here, '../../main/bds-assets/bds');
const SOURCE = fs.readFileSync(path.join(bds, 'sd-genui.js'), 'utf8');
const INJECTED = fs.readFileSync(path.join(bds, 'injected.js'), 'utf8');

function loadApi() {
  const window = { navigator: { language: 'en' } };
  const context = vm.createContext({ window, document: { body: null }, console });
  vm.runInContext(SOURCE, context, { filename: 'sd-genui.js' });
  return window.__sdGenUI;
}

function calculatorSpec() {
  return {
    version: 1,
    title: 'Compound growth',
    components: [
      { type: 'slider', id: 'principal', label: 'Principal', min: 1000, max: 50000, step: 500, value: 10000, format: 'currency' },
      { type: 'slider', id: 'rate', label: 'Annual return', min: 0, max: 15, step: 0.5, value: 7, format: 'percent' },
      { type: 'slider', id: 'years', label: 'Years', min: 1, max: 40, step: 1, value: 20, format: 'integer' },
      { type: 'stat', label: 'Future value', formula: 'principal * pow(1 + rate / 100, years)', format: 'currency' },
      { type: 'chart', kind: 'line', title: 'Growth', data: [
        { label: 'Start', formula: 'principal' },
        { label: 'Future', formula: 'principal * pow(1 + rate / 100, years)' }
      ] }
    ]
  };
}

test('parses an interactive calculator and evaluates arithmetic formulas', () => {
  const ui = loadApi();
  const parsed = ui.parseSpec(JSON.stringify(calculatorSpec()));
  assert.equal(parsed.ok, true, parsed.error);
  const state = { principal: 10000, rate: 7, years: 20 };
  assert.equal(ui.evaluateFormula('principal * pow(1 + rate / 100, years)', state), 10000 * Math.pow(1.07, 20));
  assert.equal(ui.evaluateFormula('max(4, round(3.6)) + sqrt(16)', state), 8);
  assert.equal(ui.formatValue(7, 'percent'), '7%');
});

test('rejects unknown components, duplicate controls and oversized specs', () => {
  const ui = loadApi();
  assert.equal(ui.parseSpec({ version: 1, components: [{ type: 'html', value: '<script>alert(1)</script>' }] }).ok, false);
  assert.equal(ui.parseSpec({ version: 1, components: [
    { type: 'slider', id: 'amount', label: 'Amount', min: 0, max: 10, value: 5 },
    { type: 'toggle', id: 'amount', label: 'Duplicate', value: true }
  ] }).ok, false);
  assert.equal(ui.parseSpec(' '.repeat(25001)).ok, false);
});

test('formula evaluation refuses arbitrary JavaScript, unknown values and division by zero', () => {
  const ui = loadApi();
  assert.throws(() => ui.evaluateFormula('globalThis.process.exit(1)', {}));
  assert.throws(() => ui.evaluateFormula('secret + 1', {}));
  assert.throws(() => ui.evaluateFormula('10 / 0', {}));
  assert.equal(ui.parseSpec({ version: 1, components: [
    { type: 'stat', label: 'Bad formula', formula: 'window.location' }
  ] }).ok, false);
});

test('renderer and prompt share a constrained schema; generated source is not executed', () => {
  assert.match(SOURCE, /language-sds-ui/);
  assert.match(SOURCE, /data-sd-genui-hidden/);
  assert.doesNotMatch(SOURCE, /\beval\s*\(|new Function|innerHTML\s*=/);
  assert.match(INJECTED, /SDS GenUI v1/);
  assert.match(INJECTED, /sds-ui/);
  assert.match(INJECTED, /Supported component types/);
});
