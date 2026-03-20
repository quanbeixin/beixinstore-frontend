import { request } from './http'

export function getDictTypesApi(params) {
  return request.get('/config/dict/types', { params })
}

export function createDictTypeApi(payload) {
  return request.post('/config/dict/types', payload)
}

export function updateDictTypeApi(typeKey, payload) {
  return request.put(`/config/dict/types/${typeKey}`, payload)
}

export function deleteDictTypeApi(typeKey) {
  return request.delete(`/config/dict/types/${typeKey}`)
}

export function getDictItemsApi(typeKey, params = {}) {
  return request.get('/config/dict/items', {
    params: {
      typeKey,
      ...params,
    },
  })
}

export function createDictItemApi(payload) {
  return request.post('/config/dict/items', payload)
}

export function updateDictItemApi(id, payload) {
  return request.put(`/config/dict/items/${id}`, payload)
}

export function deleteDictItemApi(id) {
  return request.delete(`/config/dict/items/${id}`)
}
