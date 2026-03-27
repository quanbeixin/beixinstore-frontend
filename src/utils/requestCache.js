const cache = new Map()
const pending = new Map()

export function cachedRequest(key, requestFn, ttl = 5000) {
  const now = Date.now()
  const cached = cache.get(key)

  if (cached && now - cached.timestamp < ttl) {
    return Promise.resolve(cached.data)
  }

  if (pending.has(key)) {
    return pending.get(key)
  }

  const promise = requestFn().then(data => {
    cache.set(key, { data, timestamp: Date.now() })
    pending.delete(key)
    return data
  }).catch(err => {
    pending.delete(key)
    throw err
  })

  pending.set(key, promise)
  return promise
}

export function clearCache(key) {
  if (key) {
    cache.delete(key)
  } else {
    cache.clear()
  }
}
