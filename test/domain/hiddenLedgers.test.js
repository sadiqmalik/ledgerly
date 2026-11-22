import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHidden, visibleBooks, toggleHidden } from '../../src/utils/hiddenLedgers.mjs';

const books = [{ id: 1 }, { id: 2 }, { id: 3, active: false }];

test('hidden ledgers are dropped, but the open one stays', () => {
  assert.deepEqual(visibleBooks(books, [2], 1).map(b => b.id), [1]);
  assert.deepEqual(visibleBooks(books, [2], 2).map(b => b.id), [1, 2]);
  assert.deepEqual(visibleBooks(books, [], 3).map(b => b.id), [1, 2, 3]);
});

test('parse and toggle tolerate bad data', () => {
  assert.deepEqual(parseHidden('nope'), []);
  assert.deepEqual(parseHidden('["2",3,"x"]'), [2, 3]);
  assert.deepEqual(toggleHidden([2], 2), []);
  assert.deepEqual(toggleHidden([2], 3), [2, 3]);
});
