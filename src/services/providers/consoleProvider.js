const { formatTime } = require('../../utils/formatters')

let logger = null

function init(_config, loggerInstance) {
  logger = loggerInstance
}

async function sendNotification(payload) {
  const { text, sender, groupName, groupLink, matchedKeyword, timestamp } = payload

  const lines = [
    `🛒 BUYING INTENT DETECTED`,
    matchedKeyword ? `Keyword : ${matchedKeyword}` : null,
    `Group   : ${groupName}`,
    `Sender  : ${sender}`,
    `Time    : ${formatTime(timestamp)}`,
    `Message : ${text}`,
    groupLink ? `Link    : ${groupLink}` : null
  ]
    .filter(Boolean)
    .join('\n')

  logger.info('Console notification\n' + lines)
}

module.exports = {
  name: 'console',
  init,
  sendNotification
}