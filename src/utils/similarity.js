/**
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function cosineSimilarity(a, b) {
  let dot = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  return normA === 0 || normB === 0 ? 0 : dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * @param {number[]} embedding
 * @param {number[][]} referenceEmbeddings
 * @returns {number}
 */
function getBestSimilarity(embedding, referenceEmbeddings) {
  let best = 0

  for (const reference of referenceEmbeddings) {
    const score = cosineSimilarity(embedding, reference)
    if (score > best) {
      best = score
    }
  }

  return best
}

module.exports = {
  cosineSimilarity,
  getBestSimilarity
}
