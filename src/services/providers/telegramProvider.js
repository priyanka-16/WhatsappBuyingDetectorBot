const axios = require('axios')

let botToken = null
let chatId = null
let logger = null

function init(config, loggerInstance) {
  botToken = config.telegramBotToken
  chatId = config.telegramChatId
  logger = loggerInstance
}

/**
 * @param {{text: string}} payload
 */
async function sendNotification(payload) {
  if (!botToken || !chatId) {
    throw new Error('Telegram provider is not configured')
  }

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`

  await axios.post(url, {
    chat_id: chatId,
    text: payload.text,
    parse_mode: 'Markdown'
  })

  logger.info('Telegram notification sent')
}

module.exports = {
  name: 'telegram',
  init,
  sendNotification
}
