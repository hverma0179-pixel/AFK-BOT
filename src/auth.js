const crypto = require('crypto')

const HASH_SEPARATOR = ':'

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}${HASH_SEPARATOR}${derivedKey}`
}

function verifyPassword(password, storedHash) {
  const [salt, originalKey] = String(storedHash).split(HASH_SEPARATOR)
  if (!salt || !originalKey) return false

  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(derivedKey, 'hex'), Buffer.from(originalKey, 'hex'))
}

module.exports = {
  hashPassword,
  verifyPassword
}
