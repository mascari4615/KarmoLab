import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/widgets/tools/shared/media.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('media.ts', source, ts.ScriptTarget.Latest, true);
const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'peaks');
assert.ok(fn, 'actual waveform reducer exists');
const exports = {};
vm.runInNewContext(ts.transpileModule(fn.getText(ast), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports });
const { peaks } = exports;
const pcm = (...channels) => {
  const data = channels.map(channel => Float32Array.from(channel));
  return { length: data[0].length, numberOfChannels: data.length, getChannelData: channel => data[channel] };
};

test('last sample survives a duration that does not divide into 240 columns', () => {
  const data = new Array(481).fill(0);
  data[480] = 0.75;
  const values = peaks(pcm(data));
  assert.equal(values.length, 240);
  assert.equal(values[239], 0.75);
});

test('short audio fills its duration across the full waveform width', () => {
  const values = peaks(pcm([0, 0, 0, 0, 0, 0, 0, 1]));
  assert.equal(values[239], 1);
  assert.equal(values[0], 0);
  assert.equal(values[180], 0);
});

test('each sample is represented, including all remainder positions', () => {
  for (let impulse = 0; impulse < 17; impulse++) {
    const data = new Array(17).fill(0);
    data[impulse] = 1;
    assert.equal(Math.max(...peaks(pcm(data), 6)), 1, `sample ${impulse}`);
  }
});

test('sound in the right channel remains visible with a silent left channel', () => {
  assert.equal(peaks(pcm([0, 0, 0, 0], [0, 0, -0.5, 0]), 4)[2], 0.5);
});

test('opposite stereo phases preserve their peak instead of cancelling', () => {
  assert.equal(peaks(pcm([0.5, -0.75], [-0.5, 0.75]), 1)[0], 0.75);
});

test('ordinary mono bins preserve maximum absolute amplitudes', () => {
  assert.deepEqual(Array.from(peaks(pcm([0.25, -0.75, 0.5, 0]), 2)), [0.75, 0.5]);
});

test('silence remains silent and reduction does not mutate PCM', () => {
  const buffer = pcm([0, 0, 0]);
  assert.deepEqual(Array.from(peaks(buffer, 6)), [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(Array.from(buffer.getChannelData(0)), [0, 0, 0]);
  const audible = pcm([0.5, -0.75]);
  peaks(audible, 4);
  assert.deepEqual(Array.from(audible.getChannelData(0)), [0.5, -0.75]);
});
