const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason
} = require("@whiskeysockets/baileys")

const P = require("pino")
const readline = require("readline")
const fs = require("fs")

const {
    loadModel,
    getEmbedding,
    cosineSimilarity
} = require("./intent")
const axios = require("axios")

const allowedGroups = [
    "120363123456789@g.us",
    "120363987654321@g.us",
    "120363555555555@g.us",
    "120363407114769691@g.us",
    "120363425793757879@g.us",
    "137645128691851@lid"
]

const TELEGRAM_BOT_TOKEN = "8989241309:AAF3PyE05ARjN3zLM3Faalz34yqS8F8L3Mk"
const TELEGRAM_CHAT_ID = "1076658790"

// ======================================
// BUYING INTENT EXAMPLES
// ======================================

const buyingExamples = [

    "Should I buy this phone?",

    "I am looking for a baby diaper",

    "Need recommendation for laptop",

    "Any good office chair?",

    "Looking for furniture",

    "Need a washing machine",

    "Which AC should I buy?",

    "Need baby stroller",

    "Best phone under 20k",

    "Suggest good earbuds",

    "Need kitchen appliances",

    "Should I get this?",

    "Worth buying this?",

    "Looking to purchase a high chair for baby",

    "Need recommendations for baby clothes",

    "Good bodywash under 1000",

    "Any good massage oil?",

    "Planning to buy a cooler",

    "Can you share checklist for a new born",

    "Suggest good feeding bottle",

    "Need good monitor for work",

    "Suggest a good vacuum cleaner",

    "Can you suggest a good diaper",

    "Need good baby diapers",

    "Best diapers for newborn",

    "Looking for baby products",

    "Need baby stroller",

    "Good baby carrier",

    "Best baby wipes",

    "Suggest good feeding bottle",
    "link",

    "suggest",
    "newborn",
    "hospital bag",
    "Can anyone suggest",
    "Please suggest",
    "breastfeeding",
    "nipple cream",
    "To wash Philips avent bottle which brush n detergent u guys r using and after how many months bottles should b replaced"
]

const categories = {

    baby: [
        "diaper",
        "stroller",
        "baby",
        "feeding",
        "newborn",
        "wipes"
    ],

    electronics: [
        "phone",
        "laptop",
        "earbuds",
        "monitor",
        "tv",
        "mouse"
    ],

    furniture: [
        "chair",
        "table",
        "sofa",
        "desk",
        "mattress"
    ],

    kitchen: [
        "mixer",
        "grinder",
        "fridge",
        "washing machine",
        "cookware"
    ],
}

// ======================================
// THRESHOLD
// ======================================

const SIMILARITY_THRESHOLD = 0.45

// ======================================
// STORE EMBEDDINGS
// ======================================

let buyingEmbeddings = []

// ======================================
// DEDUPLICATION
// ======================================

const processedMessages = new Set()

function detectCategory(text) {

    const lower = text.toLowerCase()

    for (const category in categories) {

        for (const keyword of categories[category]) {

            if (lower.includes(keyword)) {
                return category
            }
        }
    }

    return "unknown"
}

async function sendTelegramNotification(message) {

    try {

        const url =
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`

        await axios.post(url, {

            chat_id: TELEGRAM_CHAT_ID,

            text: message
        })

        console.log("📲 Telegram notification sent")

    } catch (err) {

        console.log("❌ Telegram notification failed")
    }
}

// ======================================
// START BOT
// ======================================

async function startSock() {

    // ======================================
    // LOAD AI MODEL
    // ======================================

    console.log("\nLoading AI intent model...\n")

    await loadModel()

    for (const example of buyingExamples) {

        const embedding =
            await getEmbedding(example)

        buyingEmbeddings.push(embedding)
    }

    console.log("✅ Intent model ready\n")

    // ======================================
    // WHATSAPP AUTH
    // ======================================

    const { state, saveCreds } =
        await useMultiFileAuthState("auth_info")

    const sock = makeWASocket({

        auth: state,

        browser: ["Ubuntu", "Chrome", "20.0.04"],

        logger: P({
            level: "silent"
        }),

        syncFullHistory: false,

        emitOwnEvents: false
    })

    // ======================================
    // SAVE CREDS
    // ======================================

    sock.ev.on("creds.update", saveCreds)

    // ======================================
    // CONNECTION EVENTS
    // ======================================

    sock.ev.on("connection.update", async (update) => {

        const {
            connection,
            lastDisconnect
        } = update

        if (connection === "open") {

            console.log("\n==========================")
            console.log("✅ WhatsApp Connected")
            console.log("==========================\n")
        }

        if (connection === "close") {

            const shouldReconnect =
                lastDisconnect?.error?.output?.statusCode !==
                DisconnectReason.loggedOut

            console.log("⚠ Connection closed")

            if (shouldReconnect) {

                console.log("🔄 Reconnecting...\n")

                startSock()
            }
        }
    })

    // ======================================
    // PAIRING CODE LOGIN
    // ======================================

    if (!sock.authState.creds.registered) {

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        })

        rl.question(
            "Enter WhatsApp number with country code: ",
            async (number) => {

                const code =
                    await sock.requestPairingCode(number)

                console.log("\n==========================")
                console.log("PAIRING CODE")
                console.log("==========================")
                console.log(code)
                console.log("==========================\n")

                rl.close()
            }
        )
    }

    // ======================================
    // MESSAGE LISTENER
    // ======================================

    sock.ev.on("messages.upsert", async ({ messages }) => {

        try {

            const msg = messages[0]

            // Ignore empty
            if (!msg.message) return

            // Ignore YOUR messages
            if (msg.key.fromMe) return

            // Ignore status
            const jid = msg.key.remoteJid || ""
            if (jid === "status@broadcast") return

            if (!allowedGroups.includes(jid)) {
                return
            }


            // ======================================
            // DEDUPLICATION
            // ======================================

            const uniqueId = msg.key.id

            if (processedMessages.has(uniqueId)) return

            processedMessages.add(uniqueId)

            // Prevent memory overflow
            if (processedMessages.size > 5000) {
                processedMessages.clear()
            }

            // ======================================
            // EXTRACT MESSAGE TEXT
            // ======================================

            const text =
                msg.message?.conversation ||
                msg.message?.extendedTextMessage?.text ||
                msg.message?.imageMessage?.caption ||
                msg.message?.videoMessage?.caption ||
                msg.message?.ephemeralMessage?.message?.extendedTextMessage?.text ||
                msg.message?.ephemeralMessage?.message?.conversation

            if (!text) return

            console.log("Incoming message:", text)

            // ======================================
            // AI INTENT DETECTION
            // ======================================

            const messageEmbedding =
                await getEmbedding(text)

            let bestScore = 0

            for (const exampleEmbedding of buyingEmbeddings) {

                const score = cosineSimilarity(
                    messageEmbedding,
                    exampleEmbedding
                )

                if (score > bestScore) {
                    bestScore = score
                }
            }

            console.log(
                "Similarity Score:",
                bestScore.toFixed(3)
            )

            // Reject weak intent
            if (bestScore < SIMILARITY_THRESHOLD) {
                return
            }

            // ======================================
            // EXTRACT DETAILS
            // ======================================

            const sender =
                msg.pushName || "Unknown"

            
            const isGroup =
                jid.endsWith("@g.us")

            const chatType =
                isGroup ? "GROUP" : "PRIVATE"

            const timestamp =
                new Date().toLocaleString()

                const category = detectCategory(text)

            // ======================================
            // DETECTED OUTPUT
            // ======================================

            console.log("\n===================================")
            console.log("🛒 BUYING INTENT DETECTED")
            console.log("===================================")
            console.log("Time:", timestamp)
            console.log("Type:", chatType)
            console.log("Sender:", sender)
            console.log("Chat ID:", jid)
            console.log("Similarity:", bestScore.toFixed(3))
            console.log("Category:", category)
            console.log("Message:", text)
            console.log("===================================\n")

            await sendTelegramNotification(

                `🛒 BUYING INTENT DETECTED

                Sender: ${sender}

                Type: ${chatType}

                Message:
                ${text}

                Similarity:
                ${bestScore.toFixed(3)}`
            )

            // ======================================
            // SAVE TO FILE
            // ======================================

            const logData = `
Time: ${timestamp}
Type: ${chatType}
Sender: ${sender}
Chat ID: ${jid}
Similarity: ${bestScore.toFixed(3)}
Message: ${text}
----------------------------------------
`

            fs.appendFileSync(
                "product_queries.txt",
                logData
            )

        } catch (err) {

            console.log("\n❌ Error processing message")
            console.log(err)
        }
    })
}

startSock()