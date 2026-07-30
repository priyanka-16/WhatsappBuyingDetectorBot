const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const P = require("pino");
const {
  getRemoteJid,
  isStatusBroadcast,
  isAllowedGroup,
  isFromMe,
} = require("../utils/groupFilter");

function getMessageText(message) {
  return (
    message?.conversation ||
    message?.extendedTextMessage?.text ||
    message?.imageMessage?.caption ||
    message?.videoMessage?.caption ||
    message?.ephemeralMessage?.message?.extendedTextMessage?.text ||
    message?.ephemeralMessage?.message?.conversation ||
    ""
  );
}

function createWhatsAppService(config, logger) {
  let sock = null;
  const groupLinkCache = new Map();
  const LINK_TTL = 6 * 60 * 60 * 1000; // 6 hours for successful links
  const FAIL_TTL = 30 * 60 * 1000; // 30 mins before retrying failed ones
  let messageHandler = null;
  let reconnectTimer = null;

  async function start(onMessage) {
    messageHandler = onMessage;
    const { state, saveCreds } = await useMultiFileAuthState(
      config.authDataPath,
    );

    const { version, isLatest } = await fetchLatestBaileysVersion();

    logger.info("Using WhatsApp Web version", {
      version: version.join("."),
      isLatest,
    });

    sock = makeWASocket({
      version,
      auth: state,
      browser: ["Ubuntu", "Chrome", "20.0.04"],
      logger: P({ level: "silent" }),
      syncFullHistory: false,
      shouldSyncHistoryMessage: ({ syncType }) => {
        // Skip only FULL history sync.
        // Allow essential syncs required for LID/group mappings.
        return syncType !== 2;
      },
      emitOwnEvents: false,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "open") {
        logger.info("WhatsApp connected");
      }

      if (connection === "close") {
        const statusCode =
          lastDisconnect?.error?.output?.statusCode ||
          lastDisconnect?.error?.statusCode ||
          lastDisconnect?.error?.data?.statusCode;

        logger.warn("WhatsApp connection closed", {
          statusCode,
          error: lastDisconnect?.error?.message,
          data: lastDisconnect?.error?.data,
        });

        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        if (shouldReconnect) {
          logger.info("Reconnecting to WhatsApp...", {
            statusCode,
          });

          if (shouldReconnect && !reconnectTimer) {
            reconnectTimer = setTimeout(async () => {
              reconnectTimer = null;

              shutdown();

              logger.info("Attempting WhatsApp reconnect...");

              try {
                await start(messageHandler);
              } catch (err) {
                logger.error("Reconnect failed", err);
              }
            }, 3000);
          }
        } else {
          logger.error(
            "WhatsApp session logged out. Manual re-authentication required.",
          );
        }
      }
    });

    if (!state.creds.registered) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      await requestPairingCode(sock, config.whatsappMobileNumber, logger);
    }

    sock.ev.on("messages.upsert", async ({ messages }) => {
      try {
        const msg = messages[0];

        if (!msg?.message) {
          return;
        }

        if (isFromMe(msg)) {
          return;
        }

        const jid = getRemoteJid(msg);
        if (!jid.endsWith("@g.us") || jid === "918269695595-1596145802@g.us") {
          return;
        }

        let groupName = "Unknown";

        try {
          const metadata = await sock.groupMetadata(jid);
          groupName = metadata.subject;
        } catch (err) {
          logger.warn("Could not fetch group metadata or invite code");
        }
        // console.log("Group Name:", groupName)
        // console.log("JID:", jid)
        // console.log("Sender:", msg.pushName)
        // console.log("Text:", msg.message.conversation)
        if (
          isStatusBroadcast(jid) ||
          !isAllowedGroup(jid, config.allowedWhatsAppGroups)
        ) {
          return;
        }

        const text = getMessageText(msg.message);
        if (!text) {
          return;
        }

        await onMessage({
          id: msg.key.id,
          chatId: jid,
          text,
          sender: msg.pushName || "Unknown",
          groupName: groupName || "Unknown",
          isGroup: jid.endsWith("@g.us"),
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error("WhatsApp message handler failed", error);
      }
    });
  }

  function shutdown() {
    if (!sock) return;

    try {
      sock.ev.removeAllListeners();
      sock.end?.();
    } catch (err) {
      logger.error("Shutdown error", err);
    }

    sock = null;
  }

  async function getGroupLink(jid) {
    const cached = groupLinkCache.get(jid);
    const now = Date.now();

    if (cached) {
      const ttl = cached.link ? LINK_TTL : FAIL_TTL;
      if (now - cached.at < ttl) {
        return cached.link; // null for non-admin groups (negative cache)
      }
    }

    if (!sock) return null;

    try {
      const metadata = await sock.groupMetadata(jid);
      const myJid = sock.user?.id?.replace(/:\d+/, "") + "@s.whatsapp.net";
      const me = metadata.participants.find((p) => p.id === myJid);
      const isAdmin = me?.admin === "admin" || me?.admin === "superadmin";

      if (!isAdmin) {
        logger.debug(
          `Not admin in "${metadata.subject}" — skipping invite link`,
        );
        groupLinkCache.set(jid, { link: null, at: now }); // negative cache
        return null;
      }

      const code = await sock.groupInviteCode(jid);
      const link = `https://chat.whatsapp.com/${code}`;
      groupLinkCache.set(jid, { link, at: now });
      logger.debug(`Fetched invite link for "${metadata.subject}"`);
      return link;
    } catch (err) {
      logger.warn(`Could not fetch invite link for ${jid}: ${err.message}`);
      groupLinkCache.set(jid, { link: null, at: now }); // negative cache on error too
      return null;
    }
  }

  return {
    start,
    shutdown,
    getGroupLink,
  };
}

/**
 * @param {object} sock - WhatsApp socket
 * @param {string} mobileNumber - Mobile number with country code
 * @param {import('winston').Logger} logger
 */
async function requestPairingCode(sock, mobileNumber, logger) {
  const code = await sock.requestPairingCode(mobileNumber);
  logger.info("PAIRING CODE GENERATED");
  logger.info(code);
}

module.exports = {
  createWhatsAppService,
};
