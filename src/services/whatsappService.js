const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
const P = require('pino')
const {
  getRemoteJid,
  isStatusBroadcast,
  isAllowedGroup,
  isFromMe
} = require('../utils/groupFilter')

function getMessageText(message) {
  return (
    message?.conversation ||
    message?.extendedTextMessage?.text ||
    message?.imageMessage?.caption ||
    message?.videoMessage?.caption ||
    message?.ephemeralMessage?.message?.extendedTextMessage?.text ||
    message?.ephemeralMessage?.message?.conversation ||
    ''
  )
}

function createWhatsAppService(config, logger) {
  let sock = null

  async function start(onMessage) {
    const { state, saveCreds } = await useMultiFileAuthState(config.authDataPath)

    sock = makeWASocket({
      auth: state,
      browser: ['Ubuntu', 'Chrome', '20.0.04'],
      logger: P({ level: 'silent' }),
      syncFullHistory: false,
      emitOwnEvents: false
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update

      if (connection === 'open') {
        logger.info('WhatsApp connected')
      }

      if (connection === 'close') {
        const reconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
        logger.warn('WhatsApp connection closed', { reconnect })

        if (reconnect) {
            logger.warn('Reconnect skipped')
        }
      }
    })

    if (!state.creds.registered) {
      await requestPairingCode(sock, config.whatsappMobileNumber, logger)
    }

    sock.ev.on('messages.upsert', async ({ messages }) => {
      try {
        const msg = messages[0]

        if (!msg?.message) {
          return
        }

        if (isFromMe(msg)) {
          return
        }

        const jid = getRemoteJid(msg)

        if (isStatusBroadcast(jid) || !isAllowedGroup(jid, config.allowedWhatsAppGroups)) {
          return
        }

        const text = getMessageText(msg.message)
        // console.log("JID:", jid)
        // console.log("Sender:", msg.pushName)
        // console.log("Text:", text)
        if (!text) {
          return
        }

        await onMessage({
          id: msg.key.id,
          chatId: jid,
          text,
          sender: msg.pushName || 'Unknown',
          isGroup: jid.endsWith('@g.us'),
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        logger.error('WhatsApp message handler failed', error)
      }
    })
  }

  function shutdown() {
  if (!sock) return

  try {
    sock.ev.removeAllListeners()
    sock.end?.()
  } catch (err) {
    logger.error('Shutdown error', err)
  }

  sock = null
}

  return {
    start,
    shutdown
  }
}

/**
 * @param {object} sock - WhatsApp socket
 * @param {string} mobileNumber - Mobile number with country code
 * @param {import('winston').Logger} logger
 */
async function requestPairingCode(sock, mobileNumber, logger) {
  const code = await sock.requestPairingCode(mobileNumber)
  logger.info('PAIRING CODE GENERATED')
  logger.info(code)
}

module.exports = {
  createWhatsAppService
}
