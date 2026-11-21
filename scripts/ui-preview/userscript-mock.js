// 仅用于本地 UI 预览：内存存储，不加载任务，不访问 B 站 API。
const values = new Map()
export const unsafeWindow = window
export const GM_getValue = (key, fallback) => values.get(key) ?? structuredClone(fallback)
export const GM_setValue = (key, value) => values.set(key, value)
export const GM_addStyle = () => {}
export const GM_xmlhttpRequest = () => {
  throw new Error('界面预览不发送 API 请求')
}
