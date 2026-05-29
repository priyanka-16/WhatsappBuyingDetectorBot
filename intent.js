const { pipeline } = require('@xenova/transformers')

let extractor = null

async function loadModel() {

    extractor = await pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2'
    )

    console.log("✅ Intent model loaded")
}

async function getEmbedding(text) {

    const output = await extractor(text, {
        pooling: 'mean',
        normalize: true
    })

    return Array.from(output.data)
}

function cosineSimilarity(a, b) {

    let dot = 0
    let normA = 0
    let normB = 0

    for (let i = 0; i < a.length; i++) {

        dot += a[i] * b[i]
        normA += a[i] * a[i]
        normB += b[i] * b[i]
    }

    return dot / (
        Math.sqrt(normA) *
        Math.sqrt(normB)
    )
}

module.exports = {
    loadModel,
    getEmbedding,
    cosineSimilarity
}