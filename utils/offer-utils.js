const Category = require('../models/category-schema');
const Product = require('../models/product-schema');

/**
 * Calculate the best offer for a product considering both product-level and category-level offers
 * @param {Object} product - Product object with populated category
 * @returns {Object} - Object containing the best offer details
 */
const calculateBestOffer = async (product) => {
    try {
        let categoryOffer = 0;
        let productOffer = product.productOffer || 0;

        // Get category offer if category is populated
        if (product.category) {
            if (typeof product.category === 'object' && product.category.categoryOffer !== undefined) {
                // Category is already populated
                categoryOffer = product.category.categoryOffer || 0;
            } else {
                // Category is just an ID, need to fetch it
                const category = await Category.findById(product.category);
                categoryOffer = category ? (category.categoryOffer || 0) : 0;
            }
        }

        // Determine the best offer
        const bestOfferPercentage = Math.max(productOffer, categoryOffer);
        
        // Determine offer type - if both are equal, prefer product offer
        let offerType = 'none';
        if (bestOfferPercentage > 0) {
            if (productOffer >= categoryOffer) {
                offerType = 'product';
            } else {
                offerType = 'category';
            }
        }
        
        // Calculate discounted price based on offer type
        let originalPrice, discountAmount, finalPrice;
        
        if (offerType === 'category') {
            // Category offers are calculated based on regular price
            originalPrice = product.regularPrice;
            discountAmount = (originalPrice * bestOfferPercentage) / 100;
            finalPrice = originalPrice - discountAmount;
        } else if (offerType === 'product') {
            // Product offers are calculated based on sale price
            originalPrice = product.salePrice || product.regularPrice;
            discountAmount = (originalPrice * bestOfferPercentage) / 100;
            finalPrice = originalPrice - discountAmount;
        } else {
            // No offer
            originalPrice = product.salePrice || product.regularPrice;
            discountAmount = 0;
            finalPrice = originalPrice;
        }

        return {
            originalPrice,
            bestOfferPercentage,
            offerType,
            discountAmount: Math.round(discountAmount * 100) / 100, // Round to 2 decimal places
            finalPrice: Math.round(finalPrice * 100) / 100, // Round to 2 decimal places
            productOffer,
            categoryOffer,
            hasOffer: bestOfferPercentage > 0
        };
    } catch (error) {
        console.error('Error calculating best offer:', error);
        const fallbackPrice = product.salePrice || product.regularPrice;
        return {
            originalPrice: fallbackPrice,
            bestOfferPercentage: 0,
            offerType: 'none',
            discountAmount: 0,
            finalPrice: fallbackPrice,
            productOffer: 0,
            categoryOffer: 0,
            hasOffer: false
        };
    }
};

/**
 * Apply best offers to an array of products
 * @param {Array} products - Array of product objects
 * @returns {Array} - Array of products with offer calculations applied
 */
const applyBestOffersToProducts = async (products) => {
    try {
        const productsWithOffers = await Promise.all(
            products.map(async (product) => {
                const offerDetails = await calculateBestOffer(product);
                return {
                    ...product.toObject ? product.toObject() : product,
                    offerDetails
                };
            })
        );
        return productsWithOffers;
    } catch (error) {
        console.error('Error applying best offers to products:', error);
        return products.map(product => {
            const fallbackPrice = product.salePrice || product.regularPrice;
            return {
                ...product.toObject ? product.toObject() : product,
                offerDetails: {
                    originalPrice: fallbackPrice,
                    bestOfferPercentage: 0,
                    offerType: 'none',
                    discountAmount: 0,
                    finalPrice: fallbackPrice,
                    productOffer: 0,
                    categoryOffer: 0,
                    hasOffer: false
                }
            };
        });
    }
};

/**
 * Get products with best offers for user display
 * @param {Object} filter - MongoDB filter object
 * @param {Object} options - Query options (sort, limit, skip, etc.)
 * @returns {Array} - Array of products with offer calculations
 */
const getProductsWithBestOffers = async (filter = {}, options = {}) => {
    try {
        let query = Product.find(filter)
            .populate('category', 'name categoryOffer isListed isDeleted')
            .sort(options.sort || { createdAt: -1 });

        // Apply limit if specified
        if (options.limit) {
            query = query.limit(options.limit);
        }

        // Apply skip for pagination if specified
        if (options.skip) {
            query = query.skip(options.skip);
        }

        const products = await query;

        // Filter out products with unlisted or deleted categories
        const validProducts = products.filter(product => {
            if (!product.category) return false;
            
            // Check if category is listed and not deleted
            const category = product.category;
            const isDeleted = category.isDeleted === true;
            const isListed = category.isListed !== false; // Default to true if undefined
            
            return !isDeleted && isListed;
        });

        return await applyBestOffersToProducts(validProducts);
    } catch (error) {
        console.error('Error getting products with best offers:', error);
        throw error;
    }
};

module.exports = {
    calculateBestOffer,
    applyBestOffersToProducts,
    getProductsWithBestOffers
};