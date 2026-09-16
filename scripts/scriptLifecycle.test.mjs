import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { test } from 'node:test'
import { acquireDocumentLock, stopScriptRequests } from '../src/library/script-lifecycle.ts'

const moduleUrl = (source) => `data:text/javascript,${encodeURIComponent(source)}`
const stateUrl = moduleUrl('export default {calls: [], aborted: 0}')
const { default: state } = await import(stateUrl)
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '$')
      return {
        url: moduleUrl(`
      import state from '${stateUrl}';
      export function GM_xmlhttpRequest(details) {
        state.calls.push(details);
        return {abort() {state.aborted++; details.onabort();}};
      }`),
        shortCircuit: true,
      }
    if (specifier === '../utils' && context.parentURL?.includes('/request/')) {
      return { url: moduleUrl('export const addURLParams = url => url;'), shortCircuit: true }
    }
    if (specifier === '../script-lifecycle') {
      return {
        url: new URL('../src/library/script-lifecycle.ts', import.meta.url).href,
        shortCircuit: true,
      }
    }
    return nextResolve(specifier, context)
  },
})
const { default: Request } = await import('../src/library/request/index.ts')
hooks.deregister()

function fakeLocks() {
  let held = false
  const queue = []
  return {
    request(name, options, callback) {
      assert.equal(name, 'BLTH:main-document:v1')
      if (held && options.ifAvailable) return Promise.resolve(callback(null))
      const run = () => {
        held = true
        return callback({ name })
      }
      if (!held) return Promise.resolve(run())
      return new Promise((resolve, reject) => {
        queue.push(() => resolve(run()))
        options.signal.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        )
      })
    },
    destroyDocument() {
      held = false
      queue.shift()?.()
    },
  }
}

test('旧文档持锁时，第二个页面不能成为主脚本；刷新页面等待文档销毁后再接管', async () => {
  const locks = fakeLocks()
  assert.equal(await acquireDocumentLock(locks), true)
  assert.equal(await acquireDocumentLock(locks), false)
  let acquired = false
  const reload = acquireDocumentLock(locks, true).then((result) => {
    acquired = result
  })
  await Promise.resolve()
  assert.equal(acquired, false)
  locks.destroyDocument()
  await reload
  assert.equal(acquired, true)
  assert.equal(await acquireDocumentLock(locks), false)
})

test('旧文档一直未退出时，恢复等待到期后安全放弃，不抢锁', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const locks = fakeLocks()
  await acquireDocumentLock(locks)
  const pending = acquireDocumentLock(locks, true)
  t.mock.timers.tick(20_000)
  assert.equal(await pending, false)
  assert.equal(await acquireDocumentLock(locks), false)
})

test('请求正常完成、网络失败、超时和中止都会结束Promise', async () => {
  const request = new Request()
  const success = request.get('/success')
  state.calls.at(-1).onload({ response: { code: 0 } })
  assert.deepEqual(await success, { code: 0 })
  const failure = request.post('/error?csrf=private')
  state.calls.at(-1).onerror({ status: 0, finalUrl: '/error?csrf=private' })
  await assert.rejects(
    failure,
    (error) => error.message.includes('status: 0') && !error.message.includes('private'),
  )
  const timeout = request.post('/timeout', null, { timeout: 30000 })
  assert.equal(state.calls.at(-1).timeout, 30000)
  state.calls.at(-1).ontimeout()
  await assert.rejects(timeout, /超时/)
  const abort = request.get('/abort')
  state.calls.at(-1).onabort()
  await assert.rejects(abort, /取消/)
})

test('浏览器同步拒绝锁请求时返回不可接管，不抛出未处理异常', async () => {
  assert.equal(
    await acquireDocumentLock({
      request() {
        throw new DOMException('blocked', 'SecurityError')
      },
    }),
    false,
  )
})

test('刷新前取消全部在途请求，忽略迟到响应，并阻止异步任务再次发送', async () => {
  const request = new Request()
  const first = request.get('/pending1')
  const firstDetails = state.calls.at(-1)
  const second = request.post('/pending2')
  const count = state.calls.length
  stopScriptRequests()
  firstDetails.onload({ response: { code: 0 } })
  await assert.rejects(first, /脚本正在退出/)
  await assert.rejects(second, /脚本正在退出/)
  assert.equal(state.aborted, 2)
  await assert.rejects(request.get('/late'), /脚本正在退出/)
  assert.equal(state.calls.length, count)
  stopScriptRequests()
  assert.equal(state.aborted, 2)
})
