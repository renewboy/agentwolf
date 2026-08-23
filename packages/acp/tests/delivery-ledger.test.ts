import { describe, expect, it } from 'vitest'
import { DeliveryLedger } from '../src/index.js'

describe('DeliveryLedger', () => {
  it('advances only after acknowledgement', () => {
    const ledger = new DeliveryLedger()
    const attempt = ledger.begin('delivery-1', 14, '2026-08-22T00:00:00.000Z')
    expect(attempt.fromSequence).toBe(1)
    expect(ledger.acknowledgedSequence).toBe(0)
    expect(ledger.acknowledge('delivery-1')).toBe(14)
    expect(ledger.activeAttempt).toBeNull()
  })

  it('blocks retries after uncertain delivery', () => {
    const ledger = new DeliveryLedger({ acknowledgedSequence: 9, activeAttempt: null })
    ledger.begin('delivery-2', 12)
    ledger.markUncertain('delivery-2', 'process disconnected')

    expect(() => ledger.begin('delivery-3', 15)).toThrow(/must be resolved/)
    expect(() => ledger.acknowledge('delivery-2')).toThrow(/cannot be acknowledged/)
    expect(ledger.snapshot().acknowledgedSequence).toBe(9)
  })

  it('abandons an uncertain turn while advancing past already delivered context', () => {
    const ledger = new DeliveryLedger({ acknowledgedSequence: 9, activeAttempt: null })
    ledger.begin('delivery-3', 15)
    ledger.markUncertain('delivery-3', 'turn timed out')

    expect(ledger.abandonUncertain('delivery-3')).toBe(15)
    expect(ledger.snapshot()).toEqual({ acknowledgedSequence: 15, activeAttempt: null })
    expect(ledger.begin('delivery-4', 18).fromSequence).toBe(16)
  })
})
