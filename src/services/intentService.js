const stringSimilarity = require("string-similarity");

const keywords = [
  "recommend",
  "recomend",
  "recco",
  "recos",
  "suggest",
  "suggestion",
  "review",
  "reviews",
  "which",
  "which one",
  "which brand",
  "worth buying",
  "looking for",
  "anyone using",
  "anyone here using",
  "anyone in the group using",
  "brand",
  "brands",
  "confused",
  "buy",
  "purchase",
  "what do you use",
  "which one",
  "help me choose",
  "need help",
  "What worked",
  "What is best",
  "Need your experience",
  "feeding",
  "link",
  "links",
  "newborn",
  "hospital bag",
  "moisturizer",
  "face moisturizer",
  "advice",
  "product",
  "products",
  "product recommendation",
];

/**
 * Analyze text using lightweight fuzzy keyword matching.
 * @param {string} text
 * @returns {{matched: boolean, keyword: string|null, score: number}}
 */
function analyzeText(text) {
  const lowerText = String(text).toLowerCase();

  for (const keyword of keywords) {
    if (lowerText.includes(keyword)) {
      return {
        matched: true,
        keyword,
        score: 1,
      };
    }
  }

  const { bestMatch } = stringSimilarity.findBestMatch(lowerText, keywords);
  const score = bestMatch.rating || 0;

  return {
    matched: score >= 0.75,
    keyword: score >= 0.75 ? bestMatch.target : null,
    score,
  };
}

module.exports = {
  analyzeText,
};
