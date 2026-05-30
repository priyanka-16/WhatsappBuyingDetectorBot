const fs = require('fs').promises
const config = require('./config/config')
const logger = require('./services/loggingService')
const { createWhatsAppService } = require('./services/whatsappService')
const { initializeIntentService, analyzeText } = require('./services/intentService')
const notificationService = require('./services/notificationService')
const MessageDeduplicator = require('./utils/deduplication')

const whatsappService = createWhatsAppService(config, logger)
const deduplicator = new MessageDeduplicator(config.messageCacheMaxSize)

/**
 * @param {{id: string, chatId: string, text: string, sender: string, isGroup: boolean, timestamp: string}} message
 */
async function handleIncomingMessage(message) {
  if (!deduplicator.addIfNew(message.id)) {
    logger.debug('Duplicate message ignored', { messageId: message.id })
    return
  }

  logger.debug('Processing incoming message', {
    messageId: message.id,
    chatId: message.chatId,
    sender: message.sender
  })

  const analysis = await analyzeText(message.text)
  logger.debug('Intent analysis complete', {
    similarity: analysis.similarity,
    category: analysis.category
  })

  if (analysis.similarity < config.similarityThreshold) {
    logger.debug('Message below similarity threshold', {
      similarity: analysis.similarity,
      threshold: config.similarityThreshold
    })
    return
  }

  const chatType = message.isGroup ? 'GROUP' : 'PRIVATE'
  const notificationText = `🛒 *BUYING INTENT DETECTED*\n\n*Sender:* ${message.sender}\n*Chat ID:* ${message.chatId}\n*Type:* ${chatType}\n*Category:* ${analysis.category}\n*Similarity:* ${analysis.similarity.toFixed(3)}\n\n*Message:* ${message.text}`

  await notificationService.sendNotification({ text: notificationText })
  await appendLogEntry(message, analysis)

  logger.info('Buying intent detected and notification sent', {
    messageId: message.id,
    similarity: analysis.similarity,
    category: analysis.category
  })
}

/**
 * @param {{id: string, chatId: string, text: string, sender: string, isGroup: boolean, timestamp: string}} message
 * @param {{similarity: number, category: string}} analysis
 */
async function appendLogEntry(message, analysis) {
  const entry = [
    `Time: ${message.timestamp}`,
    `Type: ${message.isGroup ? 'GROUP' : 'PRIVATE'}`,
    `Sender: ${message.sender}`,
    `Chat ID: ${message.chatId}`,
    `Similarity: ${analysis.similarity.toFixed(3)}`,
    `Category: ${analysis.category}`,
    `Message: ${message.text}`,
    '----------------------------------------',
    ''
  ].join('\n')

  await fs.appendFile(config.outputLogFile, `${entry}\n`, 'utf8')
}

async function start() {
  logger.info('Starting WhatsApp buying detector')

  notificationService.initializeNotificationService(config, logger)
  await initializeIntentService(logger)

  await whatsappService.start(handleIncomingMessage)

  logger.info('WhatsApp buying detector is running')
}

async function shutdown() {
  logger.info('Shutting down gracefully')
  whatsappService.shutdown()
  logger.info('Shutdown complete')
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error)
  //shutdown()
})
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason })
  //shutdown()
})

start().catch((error) => {
  logger.error('Startup failure', error)
  process.exit(1)
})
