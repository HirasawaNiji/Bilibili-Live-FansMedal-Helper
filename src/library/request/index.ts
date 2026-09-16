import { GM_xmlhttpRequest, type GmXmlhttpRequestOption, type GmResponseType } from '$'
import _ from 'lodash'
import { addURLParams } from '../utils'
import { isScriptStopping, registerRequestCancellation } from '../script-lifecycle'

function requestError(kind: string, response?: { status: number }): Error {
  // 不输出完整 URL，避免把 csrf、设备标识和签名带入导出日志。
  return new Error(`${kind}${response ? ` (HTTP status: ${response.status})` : ''}`)
}

function sendTrackedRequest(
  details: GmXmlhttpRequestOption<GmResponseType, any>,
  reject: (error: Error) => void,
): void {
  if (isScriptStopping()) {
    reject(requestError('脚本正在退出，请求已取消'))
    return
  }
  let finished = false
  let handle: { abort: () => void } | undefined
  let unregister = () => {}
  const cancel = () => {
    if (finished) return
    finished = true
    unregister()
    reject(requestError('脚本正在退出，请求已取消'))
    try {
      handle?.abort()
    } catch {
      /* 页面退出时可能已由管理器取消。 */
    }
  }
  unregister = registerRequestCancellation(cancel)
  const finish = () => {
    if (finished) return false
    finished = true
    unregister()
    return true
  }
  const { onload, onerror, ontimeout, onabort } = details
  details.onload = function (response) {
    if (finish()) onload?.call(this, response)
  }
  details.onerror = function (response) {
    if (finish()) onerror?.call(this, response)
  }
  details.ontimeout = () => {
    if (finish()) ontimeout?.()
  }
  details.onabort = () => {
    if (finish()) onabort?.()
  }
  try {
    handle = GM_xmlhttpRequest(details)
  } catch (error) {
    finished = true
    unregister()
    reject(error instanceof Error ? error : requestError('无法发送请求'))
  }
}

class Request {
  /** 请求 URL 的前缀 */
  private readonly url_prefix: string
  /**
   * 请求 Header 中 Origin 的值
   *
   * 会在末尾添加 `/` 作为 Referer 的值
   */
  private readonly origin: string

  constructor(url_prefix?: string, origin?: string) {
    this.url_prefix = url_prefix ?? ''
    this.origin = origin ?? 'https://bilibili.com'
  }

  /**
   * 发起一个 GET 请求
   * @param url 请求 URL 除去前缀的部分
   * @param params URL 参数
   * @param otherDetails GM_xmlhttpRequest 的 details 参数
   */
  public get<T>(
    url: string,
    params?: Record<string, any> | string | null,
    otherDetails?: Partial<GmXmlhttpRequestOption<GmResponseType, any>>,
  ): Promise<T> {
    url = addURLParams(this.url_prefix + url, params)

    return new Promise<T>((resolve, reject) => {
      const defaultDetails: GmXmlhttpRequestOption<GmResponseType, any> = {
        method: 'GET',
        url,
        responseType: 'json',
        headers: {
          Accept: 'application/json, text/plain, */*',
          Referer: this.origin + '/',
          Origin: this.origin,
          'Sec-Fetch-Site': 'same-site',
        },
        onload: function (response) {
          resolve(response.response)
        },
        onerror: function (err) {
          reject(requestError('网络请求失败', err))
        },
        ontimeout: () => reject(requestError('网络请求超时')),
        onabort: () => reject(requestError('网络请求已取消')),
      }

      const details = _.defaultsDeep(otherDetails, defaultDetails)
      sendTrackedRequest(details, reject)
    })
  }

  /**
   * 发起一个 POST 请求
   * @param url 请求 URL 除去前缀的部分
   * @param data POST data
   * @param otherDetails GM_xmlhttpRequest 的 details 参数（特别的，可以提供 params 属性作为 URL 参数）
   */
  public post<T>(
    url: string,
    data?: Record<string, any> | FormData | string | null,
    otherDetails?: Partial<
      GmXmlhttpRequestOption<GmResponseType, any> & {
        params: Record<string, any> | string
      }
    >,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/json, text/plain, */*',
      Referer: this.origin + '/',
      Origin: this.origin,
      'Sec-Fetch-Site': 'same-site',
      'Content-Type': 'application/x-www-form-urlencoded',
    }

    if (_.isNil(data)) {
      data = ''
    } else if (data instanceof FormData) {
      // data 为 FormData 时以 multipart/form-data 形式提交，
      // 删除手动设置的 Content-Type，交由底层 XHR 根据 FormData 自动生成带 boundary 的请求头
      delete headers['Content-Type']
    } else if (typeof data === 'string') {
      // data 类型为 string，不做处理
    } else {
      // data 类型为 Record，转换为 string
      data = new URLSearchParams(data).toString()
    }

    url = addURLParams(this.url_prefix + url, otherDetails?.params)
    delete otherDetails?.params

    return new Promise<T>((resolve, reject) => {
      const defaultDetails: GmXmlhttpRequestOption<GmResponseType, any> = {
        method: 'POST',
        url,
        data,
        responseType: 'json',
        headers,
        onload: function (response) {
          resolve(response.response)
        },
        onerror: function (err) {
          reject(requestError('网络请求失败', err))
        },
        ontimeout: () => reject(requestError('网络请求超时')),
        onabort: () => reject(requestError('网络请求已取消')),
      }

      const details = _.defaultsDeep(otherDetails, defaultDetails)
      sendTrackedRequest(details, reject)
    })
  }
}

export default Request
