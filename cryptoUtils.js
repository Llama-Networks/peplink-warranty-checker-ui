/******************************************************************************
 * cryptoUtils.js
 *
 * Provides encrypt() and decrypt() functions using AES-256-CBC with a single
 * key and IV for demonstration. Reads key/IV from .env or code. In production,
 * use a secure key management approach.
 ******************************************************************************/
const crypto = require('crypto');

// We read a 32-byte key from .env
const ENCRYPTION_KEY = process.env.DATA_ENCRYPTION_KEY || '01234567890123456789012345678901';
// A 16-byte IV
const IV = process.env.DATA_ENCRYPTION_IV || '0123456789012345';

// AES-256-CBC expects key = 32 bytes, iv = 16 bytes
// For real usage, store a random IV with each record instead of a static IV.

function encrypt(plaintext) {
  if (!plaintext) return ''; // or handle null
  try {
    const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, IV);
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return encrypted;
  } catch (err) {
    console.error('Encryption error:', err);
    return '';
  }
}

function decrypt(ciphertext) {
  if (!ciphertext) return '';
  try {
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, IV);
    let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('Decryption error:', err);
    return '';
  }
}

module.exports = {
  encrypt,
  decrypt
};
