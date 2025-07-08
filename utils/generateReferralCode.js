const crypto = require('crypto');


/**
 * Generate a unique referral code
 * @param {number} length - Length of the referral code (default: 8)
 * @returns {string} - Generated referral code
 */
const generateReferralCode = (length = 8) => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  
  return result;
};



/**
 * Generate a unique referral code with prefix
 * @param {string} prefix - Prefix for the referral code (default: 'REF')
 * @param {number} length - Length of the random part (default: 6)
 * @returns {string} - Generated referral code with prefix
 */
const generateReferralCodeWithPrefix = (prefix = 'REF', length = 6) => {
  const randomPart = generateReferralCode(length);
  return `${prefix}${randomPart}`;
};



module.exports = {
  generateReferralCode,
  generateReferralCodeWithPrefix
};