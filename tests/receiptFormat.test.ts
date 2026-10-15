import test from 'node:test'
import assert from 'node:assert/strict'
import { makeReceipt } from '../src/model.ts'
import { initialState } from './fixtures/catalog.ts'
import { amountInWords, receiptPages } from '../src/receiptFormat.ts'

test('printed totals spell out taka without losing precision', () => {
  assert.equal(amountInWords(0), 'Zero Taka Only')
  assert.equal(amountInWords(306), 'Three Hundred Six Taka Only')
  assert.equal(amountInWords(10125), 'Ten Thousand One Hundred Twenty Five Taka Only')
  assert.equal(amountInWords(100000), 'One Lakh Taka Only')
  assert.equal(amountInWords(10000000), 'One Crore Taka Only')
  assert.throws(() => amountInWords(-1), /Invalid receipt total/)
  assert.throws(() => amountInWords(10.5), /Invalid receipt total/)
})

test('A4 continuation keeps all lines in order and uses continuous serial numbers', () => {
  const receipt = makeReceipt(initialState, 100000, 'cash')
  const lines = Array.from({ length: 31 }, (_, i) => ({ ...receipt.lines[0], productId: `item-${i}` }))
  const pages = receiptPages(lines, Array(31).fill(28), 420)
  assert.deepEqual(pages.map(page => page.length), [15, 15, 1])
  assert.deepEqual(pages.flat().map(row => row.line), lines)
  assert.deepEqual(pages.flat().map(row => row.number), Array.from({ length: 31 }, (_, i) => i + 1))
  assert.equal(receiptPages(lines.slice(0, 15), Array(15).fill(28), 420).length, 1)
})

test('long item descriptions move onto another page without losing sale lines', () => {
  const receipt = makeReceipt(initialState, 100000, 'cash')
  const lines = Array.from({ length: 15 }, () => receipt.lines[0])
  const heights = [84, ...Array(14).fill(28)]
  const pages = receiptPages(lines, heights, 420)
  assert.equal(pages.length, 2)
  assert.equal(pages.flat().length, lines.length)
  assert.ok(pages.every(page => page.reduce((total, row) => total + heights[row.number - 1], 0) <= 420))
})

test('eight short items stay together when their measured heights fit', () => {
  const receipt = makeReceipt(initialState, 100000, 'cash')
  const lines = Array.from({ length: 8 }, () => receipt.lines[0])
  assert.equal(receiptPages(lines, Array(8).fill(28.5), 420).length, 1)
})

test('only an item exceeding the In Words boundary starts the next page', () => {
  const receipt = makeReceipt(initialState, 100000, 'cash')
  const lines = Array.from({ length: 4 }, () => receipt.lines[0])
  assert.deepEqual(receiptPages(lines, [25.25, 25.25, 49.5, 1], 100).map(page => page.length), [3, 1])
  assert.equal(receiptPages(lines, [25.25, 25.25, 49.5, 1], 101).length, 1)
})

test('a row taller than a page is kept once without an empty leading page', () => {
  const receipt = makeReceipt(initialState, 100000, 'cash')
  const lines = Array.from({ length: 3 }, () => receipt.lines[0])
  const pages = receiptPages(lines, [500, 28, 28], 420)
  assert.deepEqual(pages.map(page => page.length), [1, 2])
  assert.deepEqual(pages.flat().map(row => row.number), [1, 2, 3])
  assert.deepEqual(receiptPages([]), [[]])
})
