const Product = require("../../models/product-schema");
const Category = require("../../models/category-schema");
const Review = require("../../models/review-schema");
const { getProductsWithBestOffers, calculateBestOffer } = require("../../utils/offer-utils");

// Load shop page with filtering
const loadShop = async (req, res) => {
  try {
    const Category = require('../../models/category-schema');

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = 9; // 3 columns × 3 rows = 9 products per page
    const skip = (page - 1) * limit;

    // Filter parameters
    const selectedCategory = req.query.category || '';
    const searchQuery = req.query.search || '';
    const sortBy = req.query.sort || 'newest';
    const minPrice = req.query.minPrice ? parseFloat(req.query.minPrice) : null;
    const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice) : null;

    // Get categories for filter dropdown
    const categories = await Category.find({ isListed: true }).sort({ name: 1 });

    // Build search query
    const searchFilter = {
      isDeleted: false,
      isBlocked: false,
      isListed: true
    };

    // Add category filter
    if (selectedCategory) {
      searchFilter.category = selectedCategory;
    }

    // Add comprehensive search filter
    if (searchQuery) {
      searchFilter.$or = [
        { productName: { $regex: searchQuery, $options: 'i' } },
        { brand: { $regex: searchQuery, $options: 'i' } },
        { description: { $regex: searchQuery, $options: 'i' } },
        { features: { $regex: searchQuery, $options: 'i' } }
      ];
    }

    // Add price range filter
    if (minPrice !== null || maxPrice !== null) {
      searchFilter.salePrice = {};
      if (minPrice !== null) {
        searchFilter.salePrice.$gte = minPrice;
      }
      if (maxPrice !== null) {
        searchFilter.salePrice.$lte = maxPrice;
      }
    }

    // Build sort query
    let sortQuery = {};
    switch (sortBy) {
      case 'price-low':
        sortQuery = { salePrice: 1 };
        break;
      case 'price-high':
        sortQuery = { salePrice: -1 };
        break;
      case 'name-az':
        sortQuery = { productName: 1 };
        break;
      case 'name-za':
        sortQuery = { productName: -1 };
        break;
      default:
        sortQuery = { createdAt: -1 }; // newest first
    }

    // Fetch products with category filtering
    // Get products with best offers applied
    const options = {
      sort: sortQuery,
      limit: limit,
      skip: skip
    };

    const productsWithOffers = await getProductsWithBestOffers(searchFilter, options);

    // Calculate average ratings for each product
    const productsWithRatings = await Promise.all(
      productsWithOffers.map(async (product) => {
        const reviews = await Review.find({
          product: product._id,
          isHidden: false
        });

        let averageRating = 0;
        let totalReviews = reviews.length;

        if (totalReviews > 0) {
          const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
          averageRating = totalRating / totalReviews;
        }

        return {
          ...product,
          averageRating: averageRating,
          totalReviews: totalReviews
        };
      })
    );

    // Get total count for pagination (need to count with category filter)
    const totalProducts = await Product.countDocuments({
      ...searchFilter,
      category: { $in: await Category.find({ isListed: true }).distinct('_id') }
    });

    // Calculate pagination
    const totalPages = Math.ceil(totalProducts / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;
    const nextPage = hasNextPage ? page + 1 : null;
    const prevPage = hasPrevPage ? page - 1 : null;

    // Generate page numbers for pagination
    const pageNumbers = [];
    const maxPagesToShow = 5;
    let startPage = Math.max(1, page - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

    if (endPage - startPage + 1 < maxPagesToShow) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(i);
    }

    // Calculate result range
    const startResult = totalProducts > 0 ? skip + 1 : 0;
    const endResult = Math.min(skip + limit, totalProducts);

    // Check for redirect message from blocked product access
    const redirectMessage = req.session.redirectMessage;
    if (redirectMessage) {
      delete req.session.redirectMessage; // Clear the message after reading
    }

    res.render('shop', {
      products: productsWithRatings,
      categories,
      redirectMessage, // Pass the redirect message to the view
      // User context is automatically added by middleware
      // Pagination data
      currentPage: page,
      totalPages,
      totalProducts,
      hasNextPage,
      hasPrevPage,
      nextPage,
      prevPage,
      pageNumbers,
      startResult,
      endResult,
      limit,
      // Filter data
      selectedCategory,
      search: req.query.search || '',
      sortBy,
      minPrice: req.query.minPrice || '',
      maxPrice: req.query.maxPrice || ''
    });

  } catch (error) {
    console.error('Error loading shop page:', error);
    res.status(500).render('error', {
      message: 'Failed to load shop page'
      // User context is automatically added by middleware
    });
  }
};

// Load product details page
const loadProductDetails = async (req, res) => {
  try {
    const productId = req.params.id;

    // Product availability is already checked by middleware
    // Get product details with populated category
    const product = await Product.findById(productId)
      .populate('category', 'name categoryOffer isListed isDeleted')
      .lean();

    // Calculate best offer for this product
    const offerDetails = await calculateBestOffer(product);
    const productWithOffer = {
      ...product,
      offerDetails
    };

    // Get reviews for this product
    const reviews = await Review.find({
      product: productId,
      isHidden: false
    })
    .populate('user', 'fullname')
    .sort({ createdAt: -1 })
    .lean();

    // Get related products from the same category (excluding current product)
    // Only show if the category is listed
    let relatedProducts = [];
    if (product.category && product.category.isListed) {
      const relatedFilter = {
        category: product.category._id,
        _id: { $ne: productId }, // Exclude current product
        isDeleted: false,
        isBlocked: false,
        isListed: true
      };

      const relatedOptions = {
        sort: { createdAt: -1 },
        limit: 4 // Show up to 4 related products
      };

      const relatedProductsWithOffers = await getProductsWithBestOffers(relatedFilter, relatedOptions);

      // Calculate average ratings for related products
      relatedProducts = await Promise.all(
        relatedProductsWithOffers.map(async (relatedProduct) => {
          const reviews = await Review.find({
            product: relatedProduct._id,
            isHidden: false
          });

          let averageRating = 0;
          let totalReviews = reviews.length;

          if (totalReviews > 0) {
            const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
            averageRating = totalRating / totalReviews;
          }

          return {
            ...relatedProduct,
            averageRating: averageRating,
            totalReviews: totalReviews
          };
        })
      );
    }

    // Calculate review statistics
    const totalReviews = reviews.length;
    let averageRating = 0;
    const ratingCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const ratingBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    if (totalReviews > 0) {
      const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
      averageRating = totalRating / totalReviews;

      // Count ratings
      reviews.forEach(review => {
        ratingCounts[review.rating]++;
      });

      // Calculate percentages
      Object.keys(ratingBreakdown).forEach(rating => {
        ratingBreakdown[rating] = totalReviews > 0
          ? (ratingCounts[rating] / totalReviews) * 100
          : 0;
      });
    }

    res.render('product-details', {
      product: productWithOffer,
      reviews,
      relatedProducts,
      // User context is automatically added by middleware
      averageRating,
      totalReviews,
      ratingCounts,
      ratingBreakdown
    });

  } catch (error) {
    console.error('Error loading product details:', error);
    res.status(500).render('error', {
      message: 'Internal server error'
      // User context is automatically added by middleware
    });
  }
};

// Submit Review
const submitReview = async (req, res) => {
  try {
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Please login to submit a review'
      });
    }

    // Get productId from route params
    const productId = req.params.id;
    const { rating, title, comment } = req.body;

    // Validate input
    if (!rating || !title || !comment) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
    }

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check if user already reviewed this product
    const existingReview = await Review.findOne({
      user: userId,
      product: productId
    });

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: 'You have already reviewed this product'
      });
    }

    // Create new review
    const newReview = new Review({
      user: userId,
      product: productId,
      rating: parseInt(rating),
      title: title.trim(),
      comment: comment.trim()
    });

    await newReview.save();

    res.json({
      success: true,
      message: 'Review submitted successfully'
    });

  } catch (error) {
    console.error('Error submitting review:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit review'
    });
  }
};

// Mark Review as Helpful
const markHelpful = async (req, res) => {
  try {
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Please login to mark reviews as helpful'
      });
    }

    // Get reviewId from route params
    const reviewId = req.params.reviewId;

    if (!reviewId) {
      return res.status(400).json({
        success: false,
        message: 'Review ID is required'
      });
    }

    // Find and update review
    const review = await Review.findByIdAndUpdate(
      reviewId,
      { $inc: { helpfulVotes: 1 } },
      { new: true }
    );

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    res.json({
      success: true,
      message: 'Marked as helpful',
      helpfulVotes: review.helpfulVotes
    });

  } catch (error) {
    console.error('Error marking review as helpful:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark as helpful'
    });
  }
};

// API endpoint to check product availability status
const checkProductStatus = async (req, res) => {
  try {
    const productId = req.params.id;

    const product = await Product.findById(productId).populate('category', 'isListed isDeleted');

    if (!product) {
      return res.json({
        success: false,
        available: false,
        message: 'Product not found',
        code: 'PRODUCT_NOT_FOUND'
      });
    }

    // Check if product's category is available
    let isCategoryAvailable = true;
    let categoryUnavailableReason = null;

    if (product.category) {
      if (product.category.isDeleted) {
        isCategoryAvailable = false;
        categoryUnavailableReason = 'CATEGORY_DELETED';
      } else if (!product.category.isListed) {
        isCategoryAvailable = false;
        categoryUnavailableReason = 'CATEGORY_UNLISTED';
      }
    }

    // Determine availability and specific reason
    let isAvailable = true;
    let unavailableReason = null;

    if (product.isDeleted) {
      isAvailable = false;
      unavailableReason = 'PRODUCT_DELETED';
    } else if (product.isBlocked) {
      isAvailable = false;
      unavailableReason = 'PRODUCT_BLOCKED';
    } else if (!product.isListed) {
      isAvailable = false;
      unavailableReason = 'PRODUCT_UNLISTED';
    } else if (!isCategoryAvailable) {
      isAvailable = false;
      unavailableReason = categoryUnavailableReason;
    }

    res.json({
      success: true,
      available: isAvailable,
      code: unavailableReason,
      status: {
        isBlocked: product.isBlocked,
        isDeleted: product.isDeleted,
        isListed: product.isListed,
        categoryListed: isCategoryAvailable,
        stock: product.quantity,
        isInStock: product.quantity > 0
      }
    });

  } catch (error) {
    console.error('Error checking product status:', error);
    res.status(500).json({
      success: false,
      available: false,
      message: 'Internal server error',
      code: 'SERVER_ERROR'
    });
  }
};

module.exports = {
  loadShop,
  loadProductDetails,
  submitReview,
  markHelpful,
  checkProductStatus
};