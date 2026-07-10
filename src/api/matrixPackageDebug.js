import { request } from './http'

export function sendMatrixPackageDebugRequestApi(payload) {
  return request.post('/matrix-package-debug/request', payload)
}
