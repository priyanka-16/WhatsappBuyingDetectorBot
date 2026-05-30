# WhatsApp Buying Detector Bot

A production-quality refactor of the WhatsApp buying intent monitor.

## Overview

- Uses Baileys to connect to WhatsApp.
- Uses Xenova transformers for embedding-based intent detection.
- Supports Telegram notifications and multiple provider modules.
- Filters unsupported groups and deduplicates messages before expensive AI processing.
- Uses structured logging and environment-based configuration.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env` and update the values:
   ```bash
   cp .env .env.local
   ```
3. Run the bot:
   ```bash
   npm start
   ```

## Configuration

- `WHATSAPP_GROUP_IDS`: comma-separated allowed WhatsApp groups.
- `SIMILARITY_THRESHOLD`: similarity score required to classify intent.
- `NOTIFICATION_PROVIDERS`: `console`, `telegram`, or both.
- `TELEGRAM_BOT_TOKEN`: Telegram bot token.
- `TELEGRAM_CHAT_ID`: Telegram chat ID.
- `LOG_LEVEL`: logging verbosity.
- `OUTPUT_LOG_FILE`: file for storing detected queries.
