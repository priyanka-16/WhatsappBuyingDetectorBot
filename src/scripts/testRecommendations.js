const {
  recommendProducts,
} = require("../services/productRecommendationService");

const queries = [
  "Can anyone suggest a good diaper?",
  "Which bottle is best for newborn?",
  "Suggest a good stroller",
  "Any toys for my 3 month old?",
  "What toys are good for 5 month baby?",
  "Need something for baby proofing cabinets",
  "Which breast pump is good?",
  "Suggest books for my baby",
  "What should I buy for starting solids?",
  "Can anyone recommend a good bib?",
];

for (const query of queries) {
  console.log("");
  console.log("====================================");
  console.log(`QUERY: ${query}`);
  console.log("====================================");

  const recommendations = recommendProducts(query);

  if (!recommendations.length) {
    console.log("❌ No recommendation");
    continue;
  }

  recommendations.forEach((product, index) => {
    console.log("");
    console.log(`${index + 1}. ${product.product}`);

    console.log(`   Sheet: ${product.sheet}`);

    console.log(`   Category: ${product.category}`);

    console.log(`   Brand: ${product.brand || "-"}`);

    console.log(`   Score: ${product.recommendationScore.toFixed(3)}`);

    console.log(`   Matched Field: ${product.matchedField}`);

    console.log(`   Link: ${product.affiliateLink}`);

    console.log("   Field scores:", product.fieldScores);
  });
}
