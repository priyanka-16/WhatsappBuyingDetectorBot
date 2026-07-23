const fs = require("fs").promises;
const config = require("./config/config");
const logger = require("./services/loggingService");
const { createWhatsAppService } = require("./services/whatsappService");
const { analyzeText } = require("./services/intentService");
const notificationService = require("./services/notificationService");
const MessageDeduplicator = require("./utils/deduplication");

const whatsappService = createWhatsAppService(config, logger);
const deduplicator = new MessageDeduplicator(config.messageCacheMaxSize);
const {
  recommendProducts,
} = require("./services/productRecommendationService");

/**
 * @param {{id: string, chatId: string, text: string, sender: string, isGroup: boolean, timestamp: string}} message
 */
async function handleIncomingMessage(message) {
  logger.debug("Incoming text received", {
    messageId: message.id,
    chatId: message.chatId,
    text: message.text,
  });

  if (!deduplicator.addIfNew(message.id)) {
    logger.debug("Duplicate message ignored", { messageId: message.id });
    return;
  }

  const analysis = analyzeText(message.text);

  logger.debug("Text analysis result", {
    matched: analysis.matched,
    keyword: analysis.keyword,
    score: analysis.score,
  });

  if (!analysis.matched) {
    logger.info("No buying intent keyword match", {
      messageId: message.id,
      keyword: analysis.keyword,
      score: analysis.score,
    });
    return;
  }

  const groupLink = message.isGroup
    ? await whatsappService.getGroupLink(message.chatId)
    : null;

  const recommendations = recommendProducts(message.text, {
    maxResults: 3,
  });

  await notificationService.sendNotification({
    text: message.text,
    sender: message.sender,
    groupName: message.groupName,
    groupLink,
    matchedKeyword: analysis.keyword,
    timestamp: message.timestamp,
    recommendations,
  });
  await appendLogEntry(message, analysis);

  logger.info("Buying intent detected and notification sent", {
    messageId: message.id,
    keyword: analysis.keyword,
    score: analysis.score,
  });
}

/**
 * @param {{id: string, chatId: string, text: string, sender: string, isGroup: boolean, timestamp: string}} message
 * @param {{matched: boolean, keyword: string|null, score: number}} analysis
 */
async function appendLogEntry(message, analysis) {
  const entry = [
    `Time: ${message.timestamp}`,
    `Type: ${message.isGroup ? "GROUP" : "PRIVATE"}`,
    `Sender: ${message.sender}`,
    `Chat ID: ${message.chatId}`,
    `Matched Keyword: ${analysis.keyword ?? "none"}`,
    `Score: ${analysis.score.toFixed(3)}`,
    `Message: ${message.text}`,
    "----------------------------------------",
    "",
  ].join("\n");

  await fs.appendFile(config.outputLogFile, `${entry}\n`, "utf8");
}

async function start() {
  logger.info("Starting WhatsApp buying detector");

  notificationService.initializeNotificationService(config, logger);

  await whatsappService.start(handleIncomingMessage);

  logger.info("WhatsApp buying detector is running");
}

async function shutdown() {
  logger.info("Shutting down gracefully");
  whatsappService.shutdown();
  logger.info("Shutdown complete");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", error);
});
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", reason?.stack || reason);
});

start().catch((error) => {
  logger.error("Startup failure", error);
  process.exit(1);
});
