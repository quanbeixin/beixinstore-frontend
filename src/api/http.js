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

    if (token) {
      config.headers = config.headers || {}
      config.headers.Authorization = `Bearer ${token}`
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
      requestUrl.includes('/auth/login') || requestUrl.includes('/auth/register')

    if (error.response?.status === 401 && !isAuthRequest && window.location.pathname !== '/login') {
      clearAuthStorage()
      window.location.replace('/login')
    }

    const message = error.response?.data?.message || error.message || '请求失败'

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
