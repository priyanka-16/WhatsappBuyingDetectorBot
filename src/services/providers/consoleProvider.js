let logger = null

function init(_config, loggerInstance) {
  logger = loggerInstance
}

/**
 * @param {{text: string}} payload
 */
async function sendNotification(payload) {
  logger.info('Console notification', { notification: payload.text })
}

module.exports = {
  name: 'console',
  init,
  sendNotification
}
