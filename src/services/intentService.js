const { pipeline } = require('@xenova/transformers')
const { examples, categories } = require('../data/buyingExamples')
const { getBestSimilarity } = require('../utils/similarity')

let extractor = null
let exampleEmbeddings = []

/**
 * Initialize the AI model and precompute embeddings for buying intent examples.
 * @param {import('winston').Logger} logger
 */
async function initializeIntentService(logger) {
  if (extractor) {
    return
  }

  logger.info('Loading intent model')
  extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
  logger.info('Intent model loaded')

  exampleEmbeddings = []

  for (const example of examples) {
    const embedding = await getEmbedding(example)
    exampleEmbeddings.push(embedding)
  }

  logger.info('Precomputed example embeddings', { exampleCount: examples.length })
}

/**
 * @param {string} text
 * @returns {Promise<number[]>}
 */
async function getEmbedding(text) {
  if (!extractor) {
    throw new Error('Intent service is not initialized')
  }

  const output = await extractor(text, {
    pooling: 'mean',
    normalize: true
  })

  return Array.from(output.data)
}

/**
 * @param {string} text
 * @returns {string}
 */
function detectCategory(text) {
  const lower = text.toLowerCase()

  for (const category of Object.keys(categories)) {
    for (const keyword of categories[category]) {
      if (lower.includes(keyword)) {
        return category
      }
    }
  }

  return 'unknown'
}

/**
 * Analyze a chat text and return similarity and category details.
 * @param {string} text
 * @returns {Promise<{similarity: number, category: string}>}
 */
async function analyzeText(text) {
  if (!extractor || !exampleEmbeddings.length) {
    throw new Error('Intent service is not initialized')
  }

  const embedding = await getEmbedding(text)
  return {
    similarity: getBestSimilarity(embedding, exampleEmbeddings),
    category: detectCategory(text)
  }
}

module.exports = {
  initializeIntentService,
  analyzeText
}
