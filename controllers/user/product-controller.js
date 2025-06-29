const Product = require('../../models/product-schema');
const Category = require('../../models/category-schema');
const { getProductsWithBestOffers, calculateBestOffer } = require('../../utils/offer-utils');

/**
 * Get all products for user with best offers applied
 */
const getProducts = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const search = req.query.search || '';
        const category = req.query.category || '';
        const sortBy = req.query.sortBy || 'newest';

        // Build filter
        const filter = {
            isDeleted: false,
            isBlocked: false,
            isListed: true
        };

        // Add search filter
        if (search) {
            filter.$or = [
                { productName: { $regex: search, $options: 'i' } },
                { brand: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        // Add category filter
        if (category) {
            filter.category = category;
        }

        // Build sort options
        let sortOptions = { createdAt: -1 }; // Default: newest first
        switch (sortBy) {
            case 'price-low':
                sortOptions = { salePrice: 1 };
                break;
            case 'price-high':
                sortOptions = { salePrice: -1 };
                break;
            case 'name-asc':
                sortOptions = { productName: 1 };
                break;
            case 'name-desc':
                sortOptions = { productName: -1 };
                break;
            case 'newest':
            default:
                sortOptions = { createdAt: -1 };
                break;
        }

        const options = {
            sort: sortOptions,
            limit: limit,
            skip: (page - 1) * limit
        };

        // Get products with best offers
        const productsWithOffers = await getProductsWithBestOffers(filter, options);

        // Get total count for pagination
        const totalProducts = await Product.countDocuments(filter);
        const totalPages = Math.ceil(totalProducts / limit);

        res.json({
            success: true,
            products: productsWithOffers,
            pagination: {
                currentPage: page,
                totalPages,
                totalProducts,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            }
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch products'
        });
    }
};

/**
 * Get single product by ID with best offer applied
 */
const getProductById = async (req, res) => {
    try {
        const productId = req.params.id;

        const product = await Product.findOne({
            _id: productId,
            isDeleted: false,
            isBlocked: false,
            isListed: true
        }).populate('category', 'name categoryOffer');

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // Calculate best offer for this product
        const offerDetails = await calculateBestOffer(product);

        const productWithOffer = {
            ...product.toObject(),
            offerDetails
        };

        res.json({
            success: true,
            product: productWithOffer
        });
    } catch (error) {
        console.error('Error fetching product:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch product'
        });
    }
};

/**
 * Get products by category with best offers applied
 */
const getProductsByCategory = async (req, res) => {
    try {
        const categoryId = req.params.categoryId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const sortBy = req.query.sortBy || 'newest';

        // Check if category exists and is active
        const category = await Category.findOne({
            _id: categoryId,
            isListed: true,
            $or: [
                { isDeleted: false },
                { isDeleted: { $exists: false } }
            ]
        });

        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Category not found'
            });
        }

        const filter = {
            category: categoryId,
            isDeleted: false,
            isBlocked: false,
            isListed: true
        };

        // Build sort options
        let sortOptions = { createdAt: -1 };
        switch (sortBy) {
            case 'price-low':
                sortOptions = { salePrice: 1 };
                break;
            case 'price-high':
                sortOptions = { salePrice: -1 };
                break;
            case 'name-asc':
                sortOptions = { productName: 1 };
                break;
            case 'name-desc':
                sortOptions = { productName: -1 };
                break;
            case 'newest':
            default:
                sortOptions = { createdAt: -1 };
                break;
        }

        const options = {
            sort: sortOptions,
            limit: limit,
            skip: (page - 1) * limit
        };

        // Get products with best offers
        const productsWithOffers = await getProductsWithBestOffers(filter, options);

        // Get total count for pagination
        const totalProducts = await Product.countDocuments(filter);
        const totalPages = Math.ceil(totalProducts / limit);

        res.json({
            success: true,
            category: {
                _id: category._id,
                name: category.name,
                categoryOffer: category.categoryOffer || 0
            },
            products: productsWithOffers,
            pagination: {
                currentPage: page,
                totalPages,
                totalProducts,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            }
        });
    } catch (error) {
        console.error('Error fetching products by category:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch products'
        });
    }
};

/**
 * Get featured products with best offers (for homepage)
 */
const getFeaturedProducts = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 8;

        const filter = {
            isDeleted: false,
            isBlocked: false,
            isListed: true
        };

        const options = {
            sort: { createdAt: -1 },
            limit: limit
        };

        // Get products with best offers
        const productsWithOffers = await getProductsWithBestOffers(filter, options);

        res.json({
            success: true,
            products: productsWithOffers
        });
    } catch (error) {
        console.error('Error fetching featured products:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch featured products'
        });
    }
};

/**
 * Search products with best offers applied
 */
const searchProducts = async (req, res) => {
    try {
        const query = req.query.q || '';
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;

        if (!query.trim()) {
            return res.json({
                success: true,
                products: [],
                pagination: {
                    currentPage: 1,
                    totalPages: 0,
                    totalProducts: 0,
                    hasNextPage: false,
                    hasPrevPage: false
                }
            });
        }

        const filter = {
            isDeleted: false,
            isBlocked: false,
            isListed: true,
            $or: [
                { productName: { $regex: query, $options: 'i' } },
                { brand: { $regex: query, $options: 'i' } },
                { description: { $regex: query, $options: 'i' } }
            ]
        };

        const options = {
            sort: { createdAt: -1 },
            limit: limit,
            skip: (page - 1) * limit
        };

        // Get products with best offers
        const productsWithOffers = await getProductsWithBestOffers(filter, options);

        // Get total count for pagination
        const totalProducts = await Product.countDocuments(filter);
        const totalPages = Math.ceil(totalProducts / limit);

        res.json({
            success: true,
            query: query,
            products: productsWithOffers,
            pagination: {
                currentPage: page,
                totalPages,
                totalProducts,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            }
        });
    } catch (error) {
        console.error('Error searching products:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to search products'
        });
    }
};

module.exports = {
    getProducts,
    getProductById,
    getProductsByCategory,
    getFeaturedProducts,
    searchProducts
};