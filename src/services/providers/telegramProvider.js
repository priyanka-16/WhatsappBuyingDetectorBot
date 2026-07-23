const axios = require("axios");
const { formatTime } = require("../../utils/formatters");

let botToken = null;
let chatId = null;
let logger = null;

/**
 * Initialize Telegram provider.
 */
function init(config, loggerInstance) {
  botToken = config.telegramBotToken;
  chatId = config.telegramChatId;
  logger = loggerInstance;
}

/**
 * Send buying intent + recommendations as ONE Telegram message.
 */
async function sendNotification(payload) {
  if (!botToken || !chatId) {
    throw new Error("Telegram provider is not configured");
  }

  const {
    text,
    sender,
    groupName,
    groupLink,
    matchedKeyword,
    timestamp,
    recommendations = [],
  } = payload;

  let lines = [
    `🛒 *BUYING INTENT DETECTED*`,
    ``,
    `📍 *Group:* \`${escapeMarkdown(groupName)}\``,
    `👤 *Sender:* ${escapeMarkdown(sender)}`,
    `💬 *Message:* \`${escapeMarkdown(text)}\``,
    `🕐 *Time:* ${formatTime(timestamp)}`,
    matchedKeyword ? `🔎 *Keyword:* ${escapeMarkdown(matchedKeyword)}` : null,
    groupLink ? `\n👉 [Open Group in WhatsApp](${groupLink})` : null,
  ]
    .filter((line) => line !== null)
    .join("\n");

  /*
   * Add recommendations to the SAME Telegram message.
   */
  if (recommendations.length > 0) {
    lines += `\n\n🎯 *RECOMMENDED PRODUCTS*`;

    recommendations.forEach((product, index) => {
      /*
       * Each recommendation gets its own copyable
       * inline-code block.
       */
      const copyableText = [
        product.product,

        product.brand && product.brand !== "-"
          ? `Brand: ${product.brand}`
          : null,

        product.remarks || null,

        product.affiliateLink || null,
      ]
        .filter(Boolean)
        .join("\n");

      lines +=
        `\n\n*${index + 1}️⃣ Recommendation*\n` +
        `\`${escapeMarkdown(copyableText)}\``;
    });
  } else {
    lines +=
      `\n\n🎯 *RECOMMENDED PRODUCTS*\n` +
      `_No matching recommended product found._`;
  }

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  await axios.post(url, {
    chat_id: chatId,
    text: lines,
    parse_mode: "Markdown",
    disable_web_page_preview: true,
  });

  logger.info(
    `Telegram notification sent for group: ${groupName} ` +
      `with ${recommendations.length} recommendation(s)`,
  );
}

/*
 * Escape characters that Telegram Markdown v1
 * treats specially.
 */
function escapeMarkdown(str = "") {
  return String(str).replace(/([_*`\[])/g, "\\$1");
}

module.exports = {
  name: "telegram",
  init,
  sendNotification,
};
