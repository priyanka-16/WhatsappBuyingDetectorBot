const { createLogger, format, transports } = require('winston')
const config = require('../config/config')

const logger = createLogger({
  level: config.logLevel,
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.splat(),
    format.printf(({ timestamp, level, message, stack, ...meta }) => {
      const base = `${timestamp} [${level.toUpperCase()}] ${message}`
      const metaText = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ''
      return stack ? `${base}\n${stack}${metaText}` : `${base}${metaText}`
    })
  ),
  transports: [new transports.Console()]
})

module.exports = logger
