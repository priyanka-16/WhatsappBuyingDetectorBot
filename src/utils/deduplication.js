class MessageDeduplicator {
  constructor(maxSize = 5000) {
    this.maxSize = maxSize
    this.cache = new Map()
  }

  /**
   * Adds a message ID to the cache if it is new.
   * @param {string} messageId
   * @returns {boolean} true when the message was new, false when duplicate
   */
  addIfNew(messageId) {
    if (!messageId) return false

    if (this.cache.has(messageId)) {
      return false
    }

    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey) {
        this.cache.delete(oldestKey)
      }
    }

    this.cache.set(messageId, Date.now())
    return true
  }
}

module.exports = MessageDeduplicator
