const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
const P = require('pino')
const readline = require('readline')
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
          logger.info('Attempting reconnect')
          shutdown()
          await start(onMessage)
        }
      }
    })

    if (!sock.authState.creds.registered) {
      await askForPhoneNumber(sock)
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

  async function askForPhoneNumber(sock) {
    return new Promise((resolve) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
      rl.question('Enter WhatsApp number with country code: ', async (number) => {
        const code = await sock.requestPairingCode(number)

        logger.info('PAIRING CODE GENERATED')
        logger.info(code)

        rl.close()
        resolve()
      })
    })
  }

  function shutdown() {
    if (sock) {
      sock.ev.removeAllListeners('messages.upsert')
      sock.ev.removeAllListeners('connection.update')
      sock.ev.removeAllListeners('creds.update')
      sock.end?.()
    }
  }

  return {
    start,
    shutdown
  }
}

module.exports = {
  createWhatsAppService
}
