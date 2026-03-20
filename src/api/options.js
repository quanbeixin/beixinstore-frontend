import { request } from './http'

export function getOptionsApi(type) {
  return request.get('/options', {
    params: type ? { type } : undefined,
  })
}

export function createOptionApi(type, payload) {
  return request.post(`/options/${type}`, payload)
}

export function updateOptionApi(type, id, payload) {
  return request.put(`/options/${type}/${id}`, payload)
}

export function deleteOptionApi(type, id) {
  return request.delete(`/options/${type}/${id}`)
}
