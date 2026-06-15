import axios from 'axios'
import { clearAuthStorage, getToken } from '../utils/access'

const instance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
})

instance.interceptors.request.use(
  (config) => {
    const token = getToken()

    config.headers = config.headers || {}

    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }

    if (String(config.method || '').toLowerCase() === 'get') {
      config.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
      config.headers.Pragma = 'no-cache'
      config.headers.Expires = '0'
      config.params = {
        ...(config.params || {}),
        _t: Date.now(),
      }
    }

    return config
  },
  (error) => Promise.reject(error),
)

instance.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const requestUrl = error.config?.url || ''
    const isAuthRequest =
      requestUrl.includes('/auth/login') ||
      requestUrl.includes('/auth/register') ||
      requestUrl.includes('/auth/notification-login')

    // 401 未授权 - 跳转登录
    if (error.response?.status === 401 && !isAuthRequest && window.location.pathname !== '/login') {
      clearAuthStorage()
      const redirect = `${window.location.pathname}${window.location.search}${window.location.hash}`
      window.location.replace(`/login?redirect=${encodeURIComponent(redirect)}`)
      return Promise.reject({
        status: 401,
        message: '登录已过期，请重新登录',
        data: null,
      })
    }

    // 403 无权限
    if (error.response?.status === 403) {
      const message = error.response?.data?.message || '无权限执行该操作'
      console.warn('[API] 403 Forbidden:', requestUrl, error.response?.data)
      return Promise.reject({
        status: 403,
        message,
        data: error.response?.data,
      })
    }

    // 429 请求过于频繁
    if (error.response?.status === 429) {
      return Promise.reject({
        status: 429,
        message: '请求过于频繁，请稍后再试',
        data: error.response?.data,
      })
    }

    // 500+ 服务器错误
    if (error.response?.status >= 500) {
      console.error('[API] Server Error:', requestUrl, error.response)
      return Promise.reject({
        status: error.response.status,
        message: '服务器错误，请稍后重试',
        data: error.response?.data,
      })
    }

    // 网络错误
    if (!error.response) {
      console.error('[API] Network Error:', requestUrl, error.message)
      const isTimeout =
        error.code === 'ECONNABORTED' || String(error.message || '').toLowerCase().includes('timeout')
      return Promise.reject({
        status: 0,
        message: isTimeout ? '请求超时，请稍后重试' : '网络连接失败，请检查网络',
        data: null,
      })
    }

    // 其他错误
    const message = error.response?.data?.message || error.message || '请求失败'
    console.warn('[API] Request Failed:', requestUrl, error.response?.status, message)

    return Promise.reject({
      status: error.response?.status,
      message,
      data: error.response?.data,
    })
  },
)

export default instance

export const request = {
  get: (url, config) => instance.get(url, config),
  post: (url, data, config) => instance.post(url, data, config),
  put: (url, data, config) => instance.put(url, data, config),
  delete: (url, config) => instance.delete(url, config),
  patch: (url, data, config) => instance.patch(url, data, config),
}
