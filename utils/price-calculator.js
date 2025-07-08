/**
 * Utility functions for consistent price calculations across the application
 * 
 * PRICING STRUCTURE:
 * - Regular Price: Original/Base price (highest)
 * - Sale Price: Base discounted price
 * - Offer Price: Final price after applying best offer (category vs product)
 * - Total: Based on Offer Price (final discounted price)
 */

const { calculateBestOffer } = require('./offer-utils');


/**
 * Calculate the final price customer pays after applying best offer
 * @param {Object} product - The product object with category populated
 * @returns {number} The final price customer pays
 */
const calculateFinalPrice = async (product) => {
  if (!product) return 0;
  
  try {
    const offerDetails = await calculateBestOffer(product);
    return offerDetails.finalPrice || product.salePrice || 0;
  } catch (error) {
    console.error('Error calculating final price:', error);
    return product.salePrice || 0;
  }
};



/**
 * Synchronous version for when offer details are already calculated
 * @param {number} salePrice - The sale price of the product
 * @param {Object} offerDetails - Pre-calculated offer details
 * @returns {number} The final price customer pays
 */
const calculateFinalPriceSync = (salePrice, offerDetails = null) => {
  if (!salePrice || salePrice < 0) return 0;
  
  if (offerDetails && offerDetails.finalPrice) {
    return offerDetails.finalPrice;
  }
  
  return salePrice;
};



/**
 * Calculate item total price based on final price after offers
 * @param {number} finalPrice - The final price per item after offers
 * @param {number} quantity - The quantity of items
 * @returns {number} The total price for the items
 */
const calculateItemTotal = (finalPrice, quantity) => {
  if (!finalPrice || finalPrice < 0 || !quantity || quantity < 0) return 0;
  return finalPrice * quantity;
};



/**
 * Calculate discount amount for an item (difference between original price and final offer price)
 * @param {number} originalPrice - The original price of the product (sale price before offers)
 * @param {number} finalPrice - The final price after applying best offer
 * @param {number} quantity - The quantity of items
 * @returns {number} The total discount amount from offers
 */
const calculateItemDiscount = (originalPrice, finalPrice, quantity) => {
  if (!originalPrice || originalPrice < 0 || !finalPrice || finalPrice < 0 || !quantity || quantity < 0) return 0;
  if (finalPrice >= originalPrice) return 0; // No discount if final price is higher or equal
  
  return (originalPrice - finalPrice) * quantity;
};



/**
 * Calculate cart summary totals with offer-based pricing
 * @param {Array} cartItems - Array of cart items with product data and offer details
 * @returns {Object} Object containing subtotal, totalDiscount, and other summary data
 */
const calculateCartSummary = (cartItems) => {
  let subtotal = 0; // Total based on sale prices (before offers)
  let totalDiscount = 0; // Total discount from offers
  let totalItems = 0;
  let finalAmountBeforeShipping = 0; // Amount customer actually pays (after offers)

  cartItems.forEach(item => {
    if (!item.productId || item.productId.quantity === 0) return; // Skip out of stock items
    
    const salePrice = item.productId.salePrice || 0; // Original sale price
    const quantity = item.quantity || 0;
    
    // Get final price after offers (from stored cart price or calculate)
    let finalPrice = item.price || salePrice; // Use stored cart price which should include offers
    
    // If offer details are available, use the calculated final price
    if (item.productId.offerDetails && item.productId.offerDetails.finalPrice) {
      finalPrice = item.productId.offerDetails.finalPrice;
    }
    
    // Subtotal based on sale prices (before offers)
    const itemSubtotal = salePrice * quantity;
    subtotal += itemSubtotal;
    
    // Calculate discount from offers
    const itemDiscount = calculateItemDiscount(salePrice, finalPrice, quantity);
    totalDiscount += itemDiscount;
    
    // Amount customer actually pays for this item (after offers)
    const itemFinalAmount = calculateItemTotal(finalPrice, quantity);
    finalAmountBeforeShipping += itemFinalAmount;
    
    totalItems += quantity;
  });

  // Shipping calculation based on amount customer actually pays (after offers)
  const shippingCharges = finalAmountBeforeShipping >= 500 ? 0 : 50;
  const finalAmount = finalAmountBeforeShipping + shippingCharges;

  return {
    subtotal: Math.round(subtotal), // Subtotal based on sale prices
    totalDiscount: Math.round(totalDiscount), // Total discount from offers
    shippingCharges,
    finalAmount: Math.round(finalAmount), // Final amount to pay (after offers + shipping)
    totalItems,
    amountAfterDiscount: Math.round(finalAmountBeforeShipping) // Amount after offers but before shipping
  };
};



/**
 * Sync cart item prices with current product data and offers
 * @param {Object} cartItem - Cart item object
 * @param {Object} productData - Current product data from database with category populated
 * @returns {Promise<boolean>} Whether the item was updated
 */
const syncCartItemPrice = async (cartItem, productData) => {
  try {
    // Calculate the current final price with offers
    const offerDetails = await calculateBestOffer(productData);
    const currentFinalPrice = offerDetails.finalPrice || productData.salePrice || 0;
    
    // Check if stored price differs from current final price
    if (Math.abs(cartItem.price - currentFinalPrice) > 0.01) {
      cartItem.price = currentFinalPrice; // Store final price after offers
      cartItem.totalPrice = calculateItemTotal(currentFinalPrice, cartItem.quantity);
      return true; // Item was updated
    }
    
    return false; // No update needed
  } catch (error) {
    console.error('Error syncing cart item price:', error);
    // Fallback to sale price if offer calculation fails
    const fallbackPrice = productData.salePrice || 0;
    if (Math.abs(cartItem.price - fallbackPrice) > 0.01) {
      cartItem.price = fallbackPrice;
      cartItem.totalPrice = calculateItemTotal(fallbackPrice, cartItem.quantity);
      return true;
    }
    return false;
  }
};



/**
 * Validate and update all cart items with current pricing and offers
 * @param {Array} cartItems - Array of cart items
 * @returns {Promise<boolean>} Whether any items were updated
 */
const syncAllCartPrices = async (cartItems) => {
  let anyUpdated = false;
  
  for (const item of cartItems) {
    if (item.productId && await syncCartItemPrice(item, item.productId)) {
      anyUpdated = true;
    }
  }
  
  return anyUpdated;
};



// Legacy function for backward compatibility
const calculateEffectivePrice = async (product, productOffer = 0) => {
  // Use the new offer calculation system
  try {
    const offerDetails = await calculateBestOffer(product);
    return offerDetails.finalPrice || product.salePrice || 0;
  } catch (error) {
    console.error('Error calculating effective price:', error);
    return product.salePrice || 0;
  }
};




module.exports = {
  calculateFinalPrice,
  calculateFinalPriceSync,
  calculateItemTotal,
  calculateItemDiscount,
  calculateCartSummary,
  syncCartItemPrice,
  syncAllCartPrices,
  calculateEffectivePrice // Keep for backward compatibility
};