import {describe, expect, test} from 'bun:test'
import {formatBytes, progressBar} from './progress-bar.ts'

describe('progress-bar', () => {
  test('progressBar at 0 and 100', () => {
    expect(progressBar(0)).toBe('░'.repeat(20))
    expect(progressBar(100)).toBe('▓'.repeat(20))
  })

  test('progressBar clamps', () => {
    expect(progressBar(-5)).toBe('░'.repeat(20))
    expect(progressBar(150)).toBe('▓'.repeat(20))
  })

  test('progressBar partial', () => {
    expect(progressBar(50, 10)).toBe('▓▓▓▓▓░░░░░')
  })

  test('formatBytes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(50 * 1024 ** 3)).toBe('50 GB')
  })
})
