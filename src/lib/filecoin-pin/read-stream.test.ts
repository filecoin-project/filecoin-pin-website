// @vitest-environment node
import { expect, it } from 'vitest'
import { readStreamBytes } from './read-stream.ts'

it('collects multiple chunks without changing bytes and releases the lock', async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([0, 1]))
      controller.enqueue(new Uint8Array([255, 2]))
      controller.close()
    },
  })
  expect(await readStreamBytes(stream)).toEqual(new Uint8Array([0, 1, 255, 2]))
  expect(stream.locked).toBe(false)
})
it('preserves the exact stream rejection, including wallet code, after partial output', async () => {
  const failure = Object.assign(new Error('User rejected request'), { code: 4001 })
  let reads = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (++reads === 1) controller.enqueue(new Uint8Array([1]))
      else controller.error(failure)
    },
  })
  await expect(readStreamBytes(stream)).rejects.toBe(failure)
  expect(stream.locked).toBe(false)
})
it('supports empty streams', async () => {
  expect(
    await readStreamBytes(
      new ReadableStream({
        start(controller) {
          controller.close()
        },
      })
    )
  ).toEqual(new Uint8Array())
})
