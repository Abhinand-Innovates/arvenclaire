/**
 * Utility functions for consistent price calculations across the application
 * 
 * PRICING STRUCTURE:
 * - Regular Price: Original/Base price (highest)
 * - Sale Price: Discounted price (what customer actually pays)
 * - Discount: Difference between Regular Price and Sale Price
 * - Total: Based on Sale Price (no additional discounts)
 */

/**
 * Calculate the final price customer pays (Sale Price is the final price)
 * @param {number} salePrice - The sale price of the product (already discounted)
 * @returns {number} The final price customer pays
 */
const calculateFinalPrice = (salePrice) => {
  if (!salePrice || salePrice < 0) return 0;
  return salePrice; // Sale price is the final price customer pays
};

/**
 * Calculate item total price based on sale price
 * @param {number} salePrice - The sale price per item
 * @param {number} quantity - The quantity of items
 * @returns {number} The total price for the items
 */
const calculateItemTotal = (salePrice, quantity) => {
  if (!salePrice || salePrice < 0 || !quantity || quantity < 0) return 0;
  return salePrice * quantity;
};

/**
 * Calculate discount amount for an item (difference between regular and sale price)
 * @param {number} regularPrice - The regular/original price of the product
 * @param {number} salePrice - The sale price of the product
 * @param {number} quantity - The quantity of items
 * @returns {number} The total discount amount
 */
const calculateItemDiscount = (regularPrice, salePrice, quantity) => {
  if (!regularPrice || regularPrice < 0 || !salePrice || salePrice < 0 || !quantity || quantity < 0) return 0;
  if (salePrice >= regularPrice) return 0; // No discount if sale price is higher or equal
  
  return (regularPrice - salePrice) * quantity;
};

/**
 * Calculate cart summary totals with subtotal based on regular prices
 * @param {Array} cartItems - Array of cart items with product data
 * @returns {Object} Object containing subtotal, totalDiscount, and other summary data
 */
const calculateCartSummary = (cartItems) => {
  let subtotal = 0; // Total based on regular prices (before discount)
  let totalDiscount = 0; // Total discount (regular - sale)
  let totalItems = 0;
  let finalAmountBeforeShipping = 0; // Amount customer actually pays (after discount)

  cartItems.forEach(item => {
    if (!item.productId || item.productId.quantity === 0) return; // Skip out of stock items
    
    const regularPrice = item.productId.regularPrice || 0;
    const salePrice = item.productId.salePrice || 0;
    const quantity = item.quantity || 0;
    
    // Subtotal based on regular prices
    const itemSubtotal = regularPrice * quantity;
    subtotal += itemSubtotal;
    
    // Calculate discount and final amount customer pays
    const itemDiscount = calculateItemDiscount(regularPrice, salePrice, quantity);
    totalDiscount += itemDiscount;
    
    // Amount customer actually pays for this item
    const itemFinalAmount = calculateItemTotal(salePrice, quantity);
    finalAmountBeforeShipping += itemFinalAmount;
    
    totalItems += quantity;
  });

  // Shipping calculation based on amount customer actually pays (after discount)
  const shippingCharges = finalAmountBeforeShipping >= 500 ? 0 : 50;
  const finalAmount = finalAmountBeforeShipping + shippingCharges;

  return {
    subtotal: Math.round(subtotal * 100) / 100, // Subtotal based on regular prices
    totalDiscount: Math.round(totalDiscount * 100) / 100, // Total discount amount
    shippingCharges,
    finalAmount: Math.round(finalAmount * 100) / 100, // Final amount to pay (sale price + shipping)
    totalItems,
    amountAfterDiscount: Math.round(finalAmountBeforeShipping * 100) / 100 // Amount after discount but before shipping
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
  
  // Check if stored price differs from current sale price
  if (Math.abs(cartItem.price - currentSalePrice) > 0.01) {
    cartItem.price = currentSalePrice; // Store sale price as the price
    cartItem.totalPrice = calculateItemTotal(currentSalePrice, cartItem.quantity);
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

// Legacy function for backward compatibility (now just returns sale price)
const calculateEffectivePrice = (salePrice, productOffer = 0) => {
  // Sale price is already the final discounted price
  // Ignoring productOffer as it should be already applied in sale price
  return salePrice || 0;
};

module.exports = {
  calculateFinalPrice,
  calculateItemTotal,
  calculateItemDiscount,
  calculateCartSummary,
  syncCartItemPrice,
  syncAllCartPrices,
  calculateEffectivePrice // Keep for backward compatibility
};