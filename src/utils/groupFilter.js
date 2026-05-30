/**
 * @param {object} message
 * @returns {string}
 */
function getRemoteJid(message) {
  return message?.key?.remoteJid || ''
}

/**
 * @param {string} jid
 * @returns {boolean}
 */
function isStatusBroadcast(jid) {
  return jid === 'status@broadcast'
}

/**
 * @param {string} jid
 * @param {string[]} allowedGroups
 * @returns {boolean}
 */
function isAllowedGroup(jid, allowedGroups) {
  return allowedGroups.includes(jid)
}

/**
 * @param {object} message
 * @returns {boolean}
 */
function isFromMe(message) {
  return Boolean(message?.key?.fromMe)
}

module.exports = {
  getRemoteJid,
  isAllowedGroup,
  isStatusBroadcast,
  isFromMe
}
