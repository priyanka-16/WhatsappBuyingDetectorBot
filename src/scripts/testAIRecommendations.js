const {
  recommendProducts,
} = require("../services/productRecommendationService");

const {
  classifyBuyingIntent,
  rerankProducts,
} = require("../services/aiRecommendationService");

const TEST_MESSAGES = [
  // TRUE
  "Which bottle is best for newborn?",
  "Can anyone suggest a good diaper?",
  "Suggest a good stroller",
  "Which breast pump is good?",
  "What toys are good for 5 month baby?",
  "Koi acha diaper suggest karo",
  "Which brand are you using for diapers?",
  "Has anyone used this stroller? Is it good?",

  // FALSE
  "Thanks",
  "Thank you so much",
  "I bought this bottle yesterday",
  "This bottle is very good",
  "My baby uses Pampers",
  "I recommend this stroller",
  "You can try this breast pump",
  "This worked for my baby",
  "Here is the link",
  "I ordered diapers yesterday",
  "Diapers are so expensive these days",
  "My baby is 5 months old",
  "Baby passed stool 4 times today",
  "Which doctor do you recommend?",
  "Has anyone received their order?",
];

async function run() {
  for (const message of TEST_MESSAGES) {
    console.log("\n====================================");
    console.log("MESSAGE:", message);
    console.log("====================================");

    /*
     * --------------------------------
     * STAGE 1
     * Buying intent classification
     * --------------------------------
     */
    console.log("\n[STAGE 1] Checking buying intent...");

    const classification = await classifyBuyingIntent(message);

    console.log(`Buying intent: ${classification.buyingIntent}`);

    console.log(`Confidence: ${classification.confidence}`);

    /*
     * Stop immediately if this is not buying intent.
     */
    if (!classification.buyingIntent) {
      console.log("⛔ Rejected - no recommendation search needed.");
      continue;
    }

    /*
     * --------------------------------
     * RETRIEVAL
     * Existing recommendation engine
     * --------------------------------
     */
    console.log("\n[RETRIEVAL] Finding candidates...");

    const candidates = recommendProducts(message, {
      threshold: 0.2,
      maxResults: 10,
    });

    console.log(`Candidates found: ${candidates.length}`);

    candidates.forEach((product, index) => {
      console.log(
        `${index + 1}. ${product.product}` +
          ` | ${product.brand || "-"}` +
          ` | Score: ${product.recommendationScore.toFixed(3)}`,
      );
    });

    /*
     * No candidates means there's nothing for Qwen
     * to rerank.
     */
    if (!candidates.length) {
      console.log("⚠️ No catalogue candidates found.");
      continue;
    }

    /*
     * --------------------------------
     * STAGE 2
     * Qwen reranking
     * --------------------------------
     */
    console.log("\n[STAGE 2] Qwen reranking candidates...");

    const reranked = await rerankProducts(message, candidates);

    if (!reranked.selectedProducts.length) {
      console.log("⚠️ Qwen rejected all candidates.");

      continue;
    }

    console.log("\n✅ FINAL RECOMMENDATIONS:");

    reranked.selectedProducts.forEach((product, index) => {
      console.log(`${index + 1}. ${product.product}`);

      console.log(`   Brand: ${product.brand || "-"}`);

      console.log(`   Link: ${product.affiliateLink || "-"}`);
    });
  }
}

run().catch((error) => {
  console.error("\n❌ AI TEST FAILED");
  console.error(error);
  process.exitCode = 1;
});
