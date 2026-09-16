/** 页面进入刷新/退出阶段后，不再允许任何新的脚本请求。 */
let stopping = false
const pending = new Set<() => void>()

export function isScriptStopping(): boolean {
  return stopping
}

export function registerRequestCancellation(cancel: () => void): () => void {
  if (stopping) {
    cancel()
    return () => {}
  }
  pending.add(cancel)
  return () => pending.delete(cancel)
}

export function stopScriptRequests(): void {
  stopping = true
  for (const cancel of [...pending]) cancel()
  pending.clear()
}

/**
 * 锁一直持有到文档销毁，不能在调用 reload 前主动释放。
 * 否则旧页面的异步任务可能在新页面接管后继续运行。
 */
export function acquireDocumentLock(locks: LockManager, waitForPrevious = false): Promise<boolean> {
  return new Promise((resolve) => {
    const controller = new AbortController()
    const timer = waitForPrevious ? setTimeout(() => controller.abort(), 20_000) : undefined
    const options: LockOptions = waitForPrevious
      ? { signal: controller.signal }
      : { ifAvailable: true }
    const unavailable = () => {
      clearTimeout(timer)
      resolve(false)
    }
    try {
      void locks
        .request('BLTH:main-document:v1', options, async (lock) => {
          clearTimeout(timer)
          resolve(Boolean(lock))
          if (lock) await new Promise<void>(() => {})
        })
        .catch(unavailable)
    } catch {
      unavailable()
    }
  })
}
