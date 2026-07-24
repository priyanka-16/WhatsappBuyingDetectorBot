const axios = require("axios");

const OLLAMA_URL = "http://localhost:11434/api/chat";
const MODEL = "qwen3:4b";

const REQUEST_CONFIG = {
  timeout: 120000,
};

/*
 * ============================================================
 * COMMON QWEN CALL
 * ============================================================
 *
 * Used by both:
 *
 * 1. Buying-intent classification
 * 2. Product reranking
 *
 * IMPORTANT:
 * We intentionally DO NOT use num_predict.
 * Qwen is allowed to finish its JSON response naturally.
 */
async function callQwen(systemPrompt, userPrompt) {
  const startTime = Date.now();

  const response = await axios.post(
    OLLAMA_URL,
    {
      model: MODEL,

      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],

      stream: false,

      /*
       * We don't need Qwen's extended thinking output
       * for this classification/reranking task.
       */
      think: false,

      /*
       * Force structured JSON output.
       */
      format: "json",

      /*
       * Keep Qwen loaded in memory.
       *
       * This helps avoid repeated cold-start loading.
       */
      keep_alive: "30m",

      options: {
        temperature: 0,
      },
    },
    REQUEST_CONFIG,
  );

  const elapsed = (Date.now() - startTime) / 1000;

  console.log(`🤖 Qwen response time: ${elapsed.toFixed(2)} sec`);

  const content = response.data?.message?.content;

  if (!content) {
    throw new Error("Qwen returned an empty response");
  }

  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Qwen returned invalid JSON: ${content}`);
  }
}

/*
 * ============================================================
 * STAGE 1
 * BUYING INTENT CLASSIFICATION
 * ============================================================
 *
 * This stage receives ONLY the WhatsApp message.
 *
 * Product candidates are deliberately NOT sent here.
 *
 * Goal:
 *
 * Quickly reject false positives BEFORE we spend time
 * searching/reranking products.
 */
async function classifyBuyingIntent(message) {
  if (!message || !String(message).trim()) {
    return {
      buyingIntent: false,
      confidence: 1,
    };
  }

  const systemPrompt = `
You are a strict buying-intent classifier for parenting WhatsApp conversations.

You receive a WhatsApp message.

Your job is to Determine whether the message shows CURRENT product buying,
product recommendation, or product-selection intent.

TRUE examples:
- "Which bottle should I buy?"
- "Can anyone suggest a good diaper?"
- "Which stroller is best?"
- "Any recommendations for breast pump?"
- "What should I buy for starting solids?"
- "Which brand are you using?"
- "Koi acha diaper suggest karo"
- "Best bottle kaunsa hai?"

FALSE examples:
- "Thanks"
- "I bought this yesterday"
- "This bottle is very good"
- "My baby uses Pampers"
- "I recommend this stroller"
- "You can try this"
- "This worked for my baby"
- "Here is the link"
- "Has anyone received their order?"
- general parenting advice
- medical questions
- feeding questions that are not asking what product to buy
- people merely discussing a product they already own

A product name appearing in a message does NOT automatically mean buying intent.

If there is no genuine current buying/recommendation/selection intent:
- buyingIntent must be false

Return ONLY valid JSON in exactly this structure:

{
  "buyingIntent": true,
  "confidence": 0.95
}
`.trim();

  const userPrompt = `
Classify this WhatsApp message.

MESSAGE:
${String(message).trim()}

Return only the JSON result.
`.trim();

  try {
    const parsed = await callQwen(systemPrompt, userPrompt);

    /*
     * Be strict.
     *
     * Only the literal boolean true counts as
     * buying intent.
     */
    const buyingIntent = parsed.buyingIntent === true;

    let confidence = Number(parsed.confidence);

    if (!Number.isFinite(confidence)) {
      confidence = 0;
    }

    confidence = Math.max(0, Math.min(confidence, 1));

    return {
      buyingIntent,
      confidence,
    };
  } catch (error) {
    /*
     * Fail closed.
     *
     * If AI fails, we don't want a false
     * buying-intent alert.
     */
    throw new Error(`Buying intent classification failed: ${error.message}`);
  }
}

/*
 * ============================================================
 * STAGE 2
 * PRODUCT RERANKING
 * ============================================================
 *
 * IMPORTANT:
 *
 * This function should ONLY be called after Stage 1
 * has confirmed buying intent.
 *
 * The existing recommendation engine supplies up to
 * 10 candidates.
 *
 * Qwen then selects 0-3 genuinely relevant products.
 */
async function rerankProducts(message, candidates = []) {
  if (!message || !String(message).trim()) {
    return {
      selectedProductIds: [],
      selectedProducts: [],
    };
  }

  if (!Array.isArray(candidates) || candidates.length === 0) {
    return {
      selectedProductIds: [],
      selectedProducts: [],
    };
  }

  /*
   * Give Qwen simple numbered candidates instead of
   * asking it to copy opaque product IDs.
   */
  const candidateData = candidates.map((product, index) => ({
    number: index + 1,
    product: product.product || "",
    category: product.category || "",
    brand: product.brand || "",
    remarks: product.remarks || "",
    sheet: product.sheet || "",
  }));

  const systemPrompt = `
You are a product recommendation selector for parenting products.

The user has already been confirmed to be asking for a product recommendation.

You will receive:
1. The user's message.
2. A numbered list of candidate products.

Select up to 3 candidates that DIRECTLY answer what the user is asking for.

IMPORTANT:

First understand the actual product being requested.

Examples:

"Which bottle is best for newborn?"
means the user wants a FEEDING BOTTLE.

Relevant:
- Milk Bottle
- Feeding Bottle
- Baby Bottle

Not relevant:
- Peri Bottle
- Bottle Cleaning Brush
- Newborn Diapers


"Suggest a good diaper"
means the user wants DIAPERS.

Relevant:
- Newborn Diapers
- Tape Style Diapers

Not relevant:
- Diaper Caddy
- Diaper Station
- Diaper Rash Cream


"Which breast pump is good?"
means the user wants a BREAST PUMP.

Relevant:
- Breast Pump
- Spectra Pump


"Suggest a good stroller"
means the user wants a STROLLER.

Relevant:
- Stroller
- Baby Stroller
- Cabin Friendly Stroller

Not relevant:
- Hanging Toy for Stroller

Before selecting a candidate, verify that the candidate itself is the same type
of product the user requested. If its purpose is different, reject it even if
its name contains the requested word.

For "bottle" in a baby/newborn feeding context, bottle means a feeding/milk
bottle unless the message explicitly asks for another type of bottle.

If the user asks which brand people use for a product, candidates that are
actually that product and have a brand are valid recommendations.

Example:
"Which brand are you using for diapers?"
Candidate: Newborn Diapers | Brand: Pampers
→ relevant

RULES:

- Select only candidates that directly satisfy the request.
- A shared word does not automatically make a candidate relevant.
- Consider baby's age when relevant.
- Select between 0 and 3 candidates.
- If multiple candidates are clearly relevant, you may select multiple.
- Prefer strong matches.
- Do not invent candidates.
- Return candidate NUMBERS, not product names or IDs.
- Return no more than 3 numbers.
- Return ONLY JSON.

Required format:

{
  "selected": [1, 3]
}
`.trim();

  const userPrompt = `
USER MESSAGE:

${String(message).trim()}

CANDIDATES:

${JSON.stringify(candidateData, null, 2)}

Which candidate numbers directly answer the user's request?

Return only JSON.
`.trim();

  try {
    const parsed = await callQwen(systemPrompt, userPrompt);

    /*
     * Temporary debugging.
     */
    console.log("🤖 Qwen raw reranking result:", JSON.stringify(parsed));

    let selectedNumbers = Array.isArray(parsed.selected)
      ? parsed.selected.map(Number).filter(Number.isInteger)
      : [];

    /*
     * Remove duplicates and reject invalid candidate numbers.
     */
    selectedNumbers = [...new Set(selectedNumbers)]
      .filter((number) => number >= 1 && number <= candidates.length)
      .slice(0, 3);

    /*
     * Convert candidate numbers back into the
     * trusted products.json objects.
     */
    const selectedProducts = selectedNumbers.map(
      (number) => candidates[number - 1],
    );

    const selectedProductIds = selectedProducts.map((product) =>
      String(product.id),
    );

    return {
      selectedProductIds,
      selectedProducts,
    };
  } catch (error) {
    throw new Error(`Product reranking failed: ${error.message}`);
  }
}

module.exports = {
  classifyBuyingIntent,
  rerankProducts,
};
