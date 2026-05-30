const path = require('path')
const dotenv = require('dotenv')

dotenv.config({ path: path.resolve(process.cwd(), '.env') })

function parseList(value, separator = ',') {
  if (!value) return []
  return value
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseNumber(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const config = {
  allowedWhatsAppGroups: parseList(process.env.WHATSAPP_GROUP_IDS),
  similarityThreshold: parseNumber(process.env.SIMILARITY_THRESHOLD, 0.45),
  notificationProviders: parseList(process.env.NOTIFICATION_PROVIDERS, ','),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramChatId: process.env.TELEGRAM_CHAT_ID,
  logLevel: process.env.LOG_LEVEL || 'info',
  messageCacheMaxSize: parseNumber(process.env.MESSAGE_CACHE_MAX_SIZE, 5000),
  outputLogFile: process.env.OUTPUT_LOG_FILE || 'product_queries.txt',
  authDataPath: process.env.AUTH_DATA_PATH || 'auth_info'
}

function validateConfig() {
  const missing = []

  if (!config.allowedWhatsAppGroups.length) {
    missing.push('WHATSAPP_GROUP_IDS')
  }

  if (!config.notificationProviders.length) {
    missing.push('NOTIFICATION_PROVIDERS')
  }

  if (config.notificationProviders.includes('telegram')) {
    if (!config.telegramBotToken) missing.push('TELEGRAM_BOT_TOKEN')
    if (!config.telegramChatId) missing.push('TELEGRAM_CHAT_ID')
  }

  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}

validateConfig()

module.exports = config
