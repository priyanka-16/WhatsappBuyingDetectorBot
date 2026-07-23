const stringSimilarity = require("string-similarity");
const products = require("../data/products.json");
const metadata = require("../data/productMetadata.json");

const DEFAULT_OPTIONS = {
  threshold: 0.4,
  maxResults: 3,
};

/*
 * Words that generally do not tell us WHAT product
 * the person wants.
 */
const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "is",
  "are",
  "was",
  "were",
  "for",
  "my",
  "me",
  "i",
  "we",
  "our",
  "you",
  "your",
  "any",
  "some",
  "something",
  "good",
  "best",
  "better",
  "which",
  "what",
  "should",
  "can",
  "could",
  "please",
  "suggest",
  "suggestion",
  "suggestions",
  "recommend",
  "recommendation",
  "recommendations",
  "need",
  "want",
  "buy",
  "get",
  "looking",
  "anyone",
  "old",
]);

/*
 * These words provide CONTEXT but usually aren't the
 * actual product being requested.
 *
 * Example:
 * "Which bottle is best for newborn?"
 *
 * bottle  = product
 * newborn = context
 */
const CONTEXT_WORDS = new Set([
  "baby",
  "babies",
  "newborn",
  "newborns",
  "infant",
  "infants",
  "mom",
  "mother",
  "moms",
  "mothers",
  "pregnant",
  "pregnancy",
  "month",
  "months",
  "mnth",
  "mnths",
  "year",
  "years",
  "home",
  "essential",
  "essentials",
  "premium",
  "luxury",
]);

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getMeaningfulWords(text) {
  return normalizeText(text)
    .split(" ")
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

/*
 * Fuzzy word comparison.
 *
 * This allows common spelling mistakes such as:
 *
 * botle   -> bottle
 * stroler -> stroller
 * diper   -> diaper
 */
function wordSimilarity(a, b) {
  if (!a || !b) return 0;

  if (a === b) return 1;

  const score = stringSimilarity.compareTwoStrings(a, b);

  const shortest = Math.min(a.length, b.length);

  /*
   * Short words require stricter matching because
   * accidental similarities are much more common.
   */
  if (shortest <= 4) {
    return score >= 0.85 ? score : 0;
  }

  return score >= 0.72 ? score : 0;
}

/*
 * Compare a query against one product field.
 */
function scoreField(query, field) {
  const queryWords = getMeaningfulWords(query);
  const fieldWords = getMeaningfulWords(field);

  if (!queryWords.length || !fieldWords.length) {
    return 0;
  }

  let total = 0;
  let matched = 0;

  for (const queryWord of queryWords) {
    let best = 0;

    for (const fieldWord of fieldWords) {
      const score = wordSimilarity(queryWord, fieldWord);

      best = Math.max(best, score);
    }

    if (best > 0) {
      total += best;
      matched++;
    }
  }

  if (!matched) {
    return 0;
  }

  const coverage = matched / queryWords.length;
  const quality = total / matched;

  return coverage * quality;
}

/*
 * Find manually configured semantic routes from
 * productMetadata.json.
 *
 * Examples:
 *
 * starting solids -> Solids essential
 * baby proofing   -> Babyproofing & Home Safety
 * books           -> Books
 */
function findSheetRoute(query) {
  const normalizedQuery = normalizeText(query);

  let bestRoute = null;
  let bestScore = 0;

  for (const [sheet, keywords] of Object.entries(metadata.sheetRoutes || {})) {
    for (const keyword of keywords) {
      const normalizedKeyword = normalizeText(keyword);

      /*
       * Exact phrase takes priority.
       */
      if (normalizedKeyword && normalizedQuery.includes(normalizedKeyword)) {
        return {
          sheet,
          keyword,
          score: 1,
        };
      }

      const score = scoreField(query, keyword);

      if (score > bestScore) {
        bestScore = score;

        bestRoute = {
          sheet,
          keyword,
          score,
        };
      }
    }
  }

  /*
   * Do not route based on weak fuzzy similarity.
   */
  if (bestRoute && bestScore >= 0.75) {
    return bestRoute;
  }

  return null;
}

/*
 * Extract baby's age in months.
 *
 * Examples:
 *
 * 5 month old
 * 5 months baby
 * baby is 8 months
 * 1 year old
 */
function extractAgeMonths(query) {
  const text = normalizeText(query);

  const monthMatch = text.match(/(\d{1,2})\s*(?:month|months|mnth|mnths)/);

  if (monthMatch) {
    return Number(monthMatch[1]);
  }

  const yearMatch = text.match(/(\d{1,2})\s*(?:year|years|yr|yrs)/);

  if (yearMatch) {
    return Number(yearMatch[1]) * 12;
  }

  return null;
}

/*
 * Determine whether the query is asking for toys.
 *
 * Fuzzy matching allows small spelling mistakes.
 */
function isToyQuery(query) {
  const words = getMeaningfulWords(query);

  return words.some((word) => {
    return (
      wordSimilarity(word, "toy") >= 0.8 || wordSimilarity(word, "toys") >= 0.8
    );
  });
}

/*
 * Route toy queries according to baby's age.
 */
function findToySheet(query) {
  if (!isToyQuery(query)) {
    return null;
  }

  const age = extractAgeMonths(query);

  if (age === null) {
    return null;
  }

  /*
   * Age boundaries:
   *
   * below 3 months -> Toy 0-3 month
   * 3 to <6        -> Toy 3-6 month
   * 6 to 12        -> Toys 6-12 month
   */

  if (age < 3) {
    return "Toy 0-3 month";
  }

  if (age < 6) {
    return "Toy 3-6 month";
  }

  if (age <= 12) {
    return "Toys 6-12 month";
  }

  return null;
}

/*
 * Direct product-name matching.
 *
 * Unlike scoreField(), this intentionally ignores
 * contextual words.
 *
 * Example:
 *
 * "Which bottle is best for newborn?"
 *
 * bottle  -> used
 * newborn -> ignored
 *
 * This prevents Newborn Diapers from beating
 * Milk Bottle simply because "newborn" occurs in
 * the product name.
 */
function findDirectProductMatch(query, product) {
  const queryWords = getMeaningfulWords(query).filter(
    (word) => !CONTEXT_WORDS.has(word),
  );

  const productWords = getMeaningfulWords(product.product).filter(
    (word) => !CONTEXT_WORDS.has(word),
  );

  if (!queryWords.length || !productWords.length) {
    return 0;
  }

  let bestScore = 0;

  for (const queryWord of queryWords) {
    for (const productWord of productWords) {
      const score = wordSimilarity(queryWord, productWord);

      bestScore = Math.max(bestScore, score);
    }
  }

  return bestScore;
}

/*
 * Score one product.
 */
function scoreProduct(query, product, context) {
  const scores = {
    product: scoreField(query, product.product),
    category: scoreField(query, product.category),
    remarks: scoreField(query, product.remarks),
    sheet: scoreField(query, product.sheet),
    brand: scoreField(query, product.brand),
  };

  /*
   * Base lexical score.
   *
   * Product name is intentionally the strongest field.
   */
  let finalScore =
    scores.product * 1.0 +
    scores.category * 0.45 +
    scores.remarks * 0.2 +
    scores.sheet * 0.2 +
    scores.brand * 0.1;

  /*
   * Strong direct-product bonus.
   *
   * This is primarily used for normal catalogue searches:
   *
   * bottle
   * stroller
   * diaper
   * breast pump
   * bib
   *
   * It also supports spelling mistakes through
   * wordSimilarity().
   */
  const directProductScore = findDirectProductMatch(query, product);

  if (directProductScore >= 0.85) {
    finalScore += 0.75;
  }

  /*
   * Route bonuses are retained for diagnostics/scoring.
   *
   * More importantly, recommendProducts() filters the
   * catalogue to the routed sheet before this function
   * runs.
   */
  if (context.routeSheet && product.sheet === context.routeSheet) {
    finalScore += 0.65;
  }

  /*
   * Age-specific toy route.
   */
  if (context.toySheet && product.sheet === context.toySheet) {
    finalScore += 0.8;
  }

  finalScore = Math.min(finalScore, 1);

  /*
   * Determine which field caused the strongest
   * lexical match for debugging/logging.
   */
  let matchedField = "product";

  const strongest = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];

  if (strongest) {
    matchedField = strongest[0];
  }

  /*
   * Routes are more meaningful than the lexical field,
   * so expose them in the result.
   */
  if (context.toySheet && context.toySheet === product.sheet) {
    matchedField = "age-route";
  } else if (context.routeSheet && context.routeSheet === product.sheet) {
    matchedField = "sheet-route";
  } else if (directProductScore >= 0.85) {
    matchedField = "product";
  }

  return {
    score: finalScore,
    matchedField,
    fieldScores: scores,
    directProductScore,
  };
}

/*
 * Main recommendation function.
 */
function recommendProducts(query, options = {}) {
  const {
    threshold = DEFAULT_OPTIONS.threshold,
    maxResults = DEFAULT_OPTIONS.maxResults,
  } = options;

  if (!query || !query.trim()) {
    return [];
  }

  /*
   * Stage 1:
   * Determine whether this query has a strong route.
   */
  const route = findSheetRoute(query);
  const toySheet = findToySheet(query);

  const context = {
    routeSheet: route?.sheet || null,
    routeKeyword: route?.keyword || null,
    toySheet,
  };

  /*
   * Stage 2:
   * Build candidate catalogue.
   *
   * IMPORTANT:
   *
   * A strong route FILTERS products instead of merely
   * giving them a scoring bonus.
   *
   * Priority:
   *
   * 1. Age-specific toy route
   * 2. General sheet route
   * 3. Entire catalogue
   */
  let candidates = products;

  if (toySheet) {
    const toyProducts = products.filter(
      (product) => product.sheet === toySheet,
    );

    /*
     * Fall back to full catalogue if the configured
     * sheet currently has no products.
     */
    if (toyProducts.length > 0) {
      candidates = toyProducts;
    }
  } else if (route?.sheet) {
    const routedProducts = products.filter(
      (product) => product.sheet === route.sheet,
    );

    /*
     * Fall back gracefully if a metadata route points
     * to an empty/non-existent sheet.
     */
    if (routedProducts.length > 0) {
      candidates = routedProducts;
    }
  }

  /*
   * Score only the candidate products.
   */
  const results = candidates
    .map((product) => {
      const analysis = scoreProduct(query, product, context);

      return {
        ...product,

        recommendationScore: analysis.score,

        matchedField: analysis.matchedField,

        fieldScores: analysis.fieldScores,

        directProductScore: analysis.directProductScore,
      };
    })

    .filter((product) => product.recommendationScore >= threshold)

    .sort((a, b) => {
      /*
       * Primary sorting:
       * overall recommendation score.
       */
      if (b.recommendationScore !== a.recommendationScore) {
        return b.recommendationScore - a.recommendationScore;
      }

      /*
       * Tie-breaker:
       * stronger direct product-name match.
       */
      if (b.directProductScore !== a.directProductScore) {
        return b.directProductScore - a.directProductScore;
      }

      /*
       * Final tie-breaker:
       * product-name lexical score.
       */
      return (b.fieldScores?.product || 0) - (a.fieldScores?.product || 0);
    })

    .slice(0, maxResults);

  return results;
}

module.exports = {
  recommendProducts,
  scoreField,
  normalizeText,
  extractAgeMonths,
  findSheetRoute,
  findToySheet,
};
