const Product = require("../models/product-schema");

/**
 * Middleware to check if a product is available (not blocked, deleted, or unlisted)
 * This middleware can be used for cart, wishlist, and other product operations
 * Returns JSON responses suitable for API endpoints
 */
const checkProductAvailability = async (req, res, next) => {
  try {
    const productId = req.body.productId || req.params.productId || req.params.id;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required',
        code: 'MISSING_PRODUCT_ID'
      });
    }

    // Validate ObjectId format
    if (!productId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID format',
        code: 'INVALID_PRODUCT_ID'
      });
    }

    // Check if product exists and is available
    const product = await Product.findById(productId).populate('category', 'name isListed isDeleted');

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
        code: 'PRODUCT_NOT_FOUND',
        redirect: '/shop'
      });
    }

    // Check if product's category is available
    if (product.category) {
      if (product.category.isDeleted) {
        return res.status(403).json({
          success: false,
          message: 'This product category has been removed',
          code: 'CATEGORY_DELETED',
          redirect: '/shop'
        });
      } else if (!product.category.isListed) {
        return res.status(403).json({
          success: false,
          message: 'This product category is currently unavailable',
          code: 'CATEGORY_UNLISTED',
          redirect: '/shop'
        });
      }
    }

    // Check if product is blocked, deleted, or unlisted
    if (product.isBlocked) {
      return res.status(403).json({
        success: false,
        message: 'This product is currently blocked',
        code: 'PRODUCT_BLOCKED',
        redirect: '/shop'
      });
    }

    if (product.isDeleted) {
      return res.status(403).json({
        success: false,
        message: 'This product has been removed',
        code: 'PRODUCT_DELETED',
        redirect: '/shop'
      });
    }

    if (!product.isListed) {
      return res.status(403).json({
        success: false,
        message: 'This product is currently unlisted',
        code: 'PRODUCT_UNLISTED',
        redirect: '/shop'
      });
    }

    // Check stock availability (if quantity is 0)
    if (product.quantity <= 0) {
      return res.status(403).json({
        success: false,
        message: 'This product is currently out of stock',
        code: 'OUT_OF_STOCK',
        redirect: '/shop'
      });
    }

    // Add product to request object for use in next middleware/controller
    req.product = product;
    req.productAvailability = {
      isAvailable: true,
      stock: product.quantity,
      category: product.category
    };

    next();

  } catch (error) {
    console.error('Error in checkProductAvailability middleware:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'SERVER_ERROR'
    });
  }
};

/**
 * Middleware specifically for product detail page access
 * Redirects to shop page instead of returning JSON
 * Provides user-friendly error messages via session
 */
const checkProductAvailabilityForPage = async (req, res, next) => {
  try {
    const productId = req.params.id;

    if (!productId) {
      req.session.redirectMessage = {
        type: 'error',
        title: 'Invalid Request',
        text: 'Product ID is required'
      };
      return res.redirect('/shop');
    }

    // Validate ObjectId format
    if (!productId.match(/^[0-9a-fA-F]{24}$/)) {
      req.session.redirectMessage = {
        type: 'error',
        title: 'Invalid Product',
        text: 'The product link appears to be invalid'
      };
      return res.redirect('/shop');
    }

    // Check if product exists and is available
    const product = await Product.findById(productId).populate('category', 'name isListed isDeleted');

    if (!product) {
      req.session.redirectMessage = {
        type: 'error',
        title: 'Product Not Found',
        text: 'The requested product could not be found. You have been redirected to our product listing.'
      };
      return res.redirect('/shop');
    }

    // Check if product's category is available
    if (product.category) {
      if (product.category.isDeleted) {
        req.session.redirectMessage = {
          type: 'info',
          title: 'Category Removed',
          text: 'This product category has been removed from our catalog. Browse other available products.'
        };
        return res.redirect('/shop');
      } else if (!product.category.isListed) {
        req.session.redirectMessage = {
          type: 'warning',
          title: 'Category Unavailable',
          text: 'This product category is currently unavailable. Please check out our other products.'
        };
        return res.redirect('/shop');
      }
    }

    // Check if product is blocked, deleted, or unlisted
    if (product.isBlocked) {
      req.session.redirectMessage = {
        type: 'warning',
        title: 'Product Unavailable',
        text: 'This product is currently unavailable. Please browse our other available products.'
      };
      return res.redirect('/shop');
    }

    if (product.isDeleted) {
      req.session.redirectMessage = {
        type: 'info',
        title: 'Product Removed',
        text: 'This product has been removed from our catalog. Discover other great products in our collection.'
      };
      return res.redirect('/shop');
    }

    if (!product.isListed) {
      req.session.redirectMessage = {
        type: 'info',
        title: 'Product Unlisted',
        text: 'This product is currently not available for purchase. Check out our other available products.'
      };
      return res.redirect('/shop');
    }

    // Note: We don't check stock here for page access, as users should still be able to view out-of-stock products
    // Stock checking should be done at cart/purchase level

    // Add product to request object for use in next middleware/controller
    req.product = product;
    req.productAvailability = {
      isAvailable: true,
      stock: product.quantity,
      category: product.category,
      isInStock: product.quantity > 0
    };

    next();

  } catch (error) {
    console.error('Error in checkProductAvailabilityForPage middleware:', error);
    req.session.redirectMessage = {
      type: 'error',
      title: 'Server Error',
      text: 'An error occurred while loading the product. Please try again.'
    };
    return res.redirect('/shop');
  }
};

/**
 * Utility function to check multiple products availability
 * Useful for cart, wishlist, and bulk operations
 */
const checkMultipleProductsAvailability = async (productIds) => {
  try {
    const products = await Product.find({
      _id: { $in: productIds }
    }).populate('category', 'name isListed');

    const results = productIds.map(productId => {
      const product = products.find(p => p._id.toString() === productId.toString());

      if (!product) {
        return {
          productId,
          isAvailable: false,
          reason: 'Product not found',
          code: 'PRODUCT_NOT_FOUND'
        };
      }

      // Check category availability
      if (product.category && !product.category.isListed) {
        return {
          productId,
          isAvailable: false,
          reason: 'Category unavailable',
          code: 'CATEGORY_UNAVAILABLE',
          product
        };
      }

      // Check product availability
      if (product.isBlocked) {
        return {
          productId,
          isAvailable: false,
          reason: 'Product blocked',
          code: 'PRODUCT_BLOCKED',
          product
        };
      }

      if (product.isDeleted) {
        return {
          productId,
          isAvailable: false,
          reason: 'Product deleted',
          code: 'PRODUCT_DELETED',
          product
        };
      }

      if (!product.isListed) {
        return {
          productId,
          isAvailable: false,
          reason: 'Product unlisted',
          code: 'PRODUCT_UNLISTED',
          product
        };
      }

      return {
        productId,
        isAvailable: true,
        stock: product.quantity,
        isInStock: product.quantity > 0,
        product
      };
    });

    return results;
  } catch (error) {
    console.error('Error in checkMultipleProductsAvailability:', error);
    throw error;
  }
};

/**
 * Utility function to filter available products from a list
 * Returns only products that are available for purchase
 */
const filterAvailableProducts = async (productIds) => {
  try {
    const availabilityResults = await checkMultipleProductsAvailability(productIds);
    return availabilityResults
      .filter(result => result.isAvailable)
      .map(result => result.product);
  } catch (error) {
    console.error('Error in filterAvailableProducts:', error);
    return [];
  }
};

/**
 * Middleware for cart operations that need product availability checking
 * Checks all products in the request and filters out unavailable ones
 */
const checkCartProductsAvailability = async (req, res, next) => {
  try {
    const productIds = req.body.productIds || req.body.products?.map(p => p.productId) || [];

    if (!productIds || productIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No products specified',
        code: 'NO_PRODUCTS'
      });
    }

    const availabilityResults = await checkMultipleProductsAvailability(productIds);
    const unavailableProducts = availabilityResults.filter(result => !result.isAvailable);

    if (unavailableProducts.length > 0) {
      return res.status(403).json({
        success: false,
        message: 'Some products are no longer available',
        code: 'PRODUCTS_UNAVAILABLE',
        unavailableProducts: unavailableProducts.map(p => ({
          productId: p.productId,
          reason: p.reason,
          code: p.code
        }))
      });
    }

    // Add availability results to request
    req.productAvailabilityResults = availabilityResults;
    req.availableProducts = availabilityResults.map(result => result.product);

    next();

  } catch (error) {
    console.error('Error in checkCartProductsAvailability middleware:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'SERVER_ERROR'
    });
  }
};

module.exports = {
  checkProductAvailability,
  checkProductAvailabilityForPage,
  checkMultipleProductsAvailability,
  filterAvailableProducts,
  checkCartProductsAvailability
};
