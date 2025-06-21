/**
 * Utility functions for consistent price calculations across the application
 */

/**
 * Calculate effective price after applying product offers
 * @param {number} salePrice - The sale price of the product
 * @param {number} productOffer - The product offer percentage (0-100)
 * @returns {number} The effective price after applying offers
 */
const calculateEffectivePrice = (salePrice, productOffer = 0) => {
  if (!salePrice || salePrice < 0) return 0;
  if (!productOffer || productOffer < 0 || productOffer > 100) return salePrice;
  
  return salePrice - (salePrice * productOffer / 100);
};

/**
 * Calculate item total price
 * @param {number} effectivePrice - The effective price per item
 * @param {number} quantity - The quantity of items
 * @returns {number} The total price for the items
 */
const calculateItemTotal = (effectivePrice, quantity) => {
  if (!effectivePrice || effectivePrice < 0 || !quantity || quantity < 0) return 0;
  return effectivePrice * quantity;
};

/**
 * Calculate discount amount for an item
 * @param {number} regularPrice - The regular price of the product
 * @param {number} effectivePrice - The effective price after offers
 * @param {number} quantity - The quantity of items
 * @returns {number} The total discount amount
 */
const calculateItemDiscount = (regularPrice, effectivePrice, quantity) => {
  if (!regularPrice || regularPrice < 0 || !effectivePrice || effectivePrice < 0 || !quantity || quantity < 0) return 0;
  if (effectivePrice >= regularPrice) return 0;
  
  return (regularPrice - effectivePrice) * quantity;
};

/**
 * Calculate cart summary totals
 * @param {Array} cartItems - Array of cart items with product data
 * @returns {Object} Object containing subtotal, totalDiscount, and other summary data
 */
const calculateCartSummary = (cartItems) => {
  let subtotal = 0;
  let totalDiscount = 0;
  let totalItems = 0;

  cartItems.forEach(item => {
    if (!item.productId || item.productId.quantity === 0) return; // Skip out of stock items
    
    const regularPrice = item.productId.regularPrice || 0;
    const salePrice = item.productId.salePrice || 0;
    const productOffer = item.productId.productOffer || 0;
    const quantity = item.quantity || 0;
    
    const effectivePrice = calculateEffectivePrice(salePrice, productOffer);
    const itemTotal = calculateItemTotal(effectivePrice, quantity);
    const itemDiscount = calculateItemDiscount(regularPrice, effectivePrice, quantity);
    
    subtotal += itemTotal;
    totalDiscount += itemDiscount;
    totalItems += quantity;
  });

  const shippingCharges = subtotal >= 500 ? 0 : 50; // Free shipping above ₹500
  const finalAmount = subtotal + shippingCharges;

  return {
    subtotal: Math.round(subtotal * 100) / 100, // Round to 2 decimal places
    totalDiscount: Math.round(totalDiscount * 100) / 100,
    shippingCharges,
    finalAmount: Math.round(finalAmount * 100) / 100,
    totalItems
  };
};

/**
 * Sync cart item prices with current product data
 * @param {Object} cartItem - Cart item object
 * @param {Object} productData - Current product data from database
 * @returns {boolean} Whether the item was updated
 */
const syncCartItemPrice = (cartItem, productData) => {
  const currentSalePrice = productData.salePrice || 0;
  const productOffer = productData.productOffer || 0;
  const effectivePrice = calculateEffectivePrice(currentSalePrice, productOffer);
  
  // Check if stored price differs from current effective price (with small tolerance for floating point)
  if (Math.abs(cartItem.price - effectivePrice) > 0.01) {
    cartItem.price = effectivePrice;
    cartItem.totalPrice = calculateItemTotal(effectivePrice, cartItem.quantity);
    return true; // Item was updated
  }
  
  return false; // No update needed
};

/**
 * Validate and update all cart items with current pricing
 * @param {Array} cartItems - Array of cart items
 * @returns {boolean} Whether any items were updated
 */
const syncAllCartPrices = (cartItems) => {
  let anyUpdated = false;
  
  cartItems.forEach(item => {
    if (item.productId && syncCartItemPrice(item, item.productId)) {
      anyUpdated = true;
    }
  });
  
  return anyUpdated;
};

module.exports = {
  calculateEffectivePrice,
  calculateItemTotal,
  calculateItemDiscount,
  calculateCartSummary,
  syncCartItemPrice,
  syncAllCartPrices
};