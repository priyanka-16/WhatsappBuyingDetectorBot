const telegramProvider = require('./providers/telegramProvider')
const consoleProvider = require('./providers/consoleProvider')

const providerRegistry = {
  telegram: telegramProvider,
  console: consoleProvider
}

let activeProviders = []

/**
 * @param {object} config
 * @param {import('winston').Logger} logger
 */
function initializeNotificationService(config, logger) {
  activeProviders = config.notificationProviders.map((providerName) => {
    const provider = providerRegistry[providerName]

    if (!provider) {
      throw new Error(`Unknown notification provider: ${providerName}`)
    }

    provider.init(config, logger)
    return provider
  })
}

/**
 * @param {{text: string}} payload
 */
async function sendNotification(payload) {
  if (!activeProviders.length) {
    throw new Error('No notification providers configured')
  }

  await Promise.all(activeProviders.map((provider) => provider.sendNotification(payload)))
}

module.exports = {
  initializeNotificationService,
  sendNotification
}
