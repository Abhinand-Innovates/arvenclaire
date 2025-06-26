const Product = require('../../models/product-schema');
const Category = require('../../models/category-schema');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { uploadDir } = require('../../config/multer-config');

// Helper function to save base64 image
const saveBase64Image = async (base64Data, filename) => {
    try {
        // Remove data URL prefix if present
        const base64Image = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
        const imageBuffer = Buffer.from(base64Image, 'base64');
        
        const outputPath = path.join(uploadDir, filename);
        
        // Process and save image with Sharp
        await sharp(imageBuffer)
            .resize(800, 800, {
                fit: 'cover',
                position: 'center'
            })
            .jpeg({ quality: 90 })
            .toFile(outputPath);
            
        return filename;
    } catch (error) {
        console.error('Error saving base64 image:', error);
        throw new Error('Failed to process image');
    }
};

// Helper function to delete image file
const deleteImageFile = (filename) => {
    try {
        const filePath = path.join(uploadDir, filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (error) {
        console.error('Error deleting image file:', error);
    }
};

// Render product listing page
const getProducts = async (req, res) => {
    try {
        // Pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10; // Products per page
        const skip = (page - 1) * limit;

        // Search and filter parameters
        const search = req.query.search || '';
        const selectedCategory = req.query.category || '';

        // Build search query
        const searchQuery = { isDeleted: false };

        // Add search functionality
        if (search) {
            searchQuery.$or = [
                { productName: { $regex: search, $options: 'i' } },
                { brand: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        // Add category filter
        if (selectedCategory) {
            searchQuery.category = selectedCategory;
        }

        // Fetch products and categories in parallel
        const [allProducts, totalProducts, categories] = await Promise.all([
            Product.find(searchQuery)
                .populate({
                    path: 'category',
                    match: {
                        $or: [
                            { isDeleted: false },
                            { isDeleted: { $exists: false } }
                        ]
                    },
                    select: 'name'
                })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Product.countDocuments(searchQuery),
            Category.find({
                isListed: true,
                $or: [
                    { isDeleted: false },
                    { isDeleted: { $exists: false } }
                ]
            }).sort({ name: 1 })
        ]);

        // Filter out products with null categories (deleted categories)
        const products = allProducts.filter(product => product.category !== null);

        // Calculate pagination data
        const totalPages = Math.ceil(totalProducts / limit);
        const hasNextPage = page < totalPages;
        const hasPrevPage = page > 1;
        const nextPage = hasNextPage ? page + 1 : null;
        const prevPage = hasPrevPage ? page - 1 : null;

        // Calculate page range for pagination display
        const startPage = Math.max(1, page - 2);
        const endPage = Math.min(totalPages, page + 2);
        const pageNumbers = [];
        for (let i = startPage; i <= endPage; i++) {
            pageNumbers.push(i);
        }

        // Calculate result range
        const startResult = totalProducts > 0 ? skip + 1 : 0;
        const endResult = Math.min(skip + limit, totalProducts);

        // Build query string for pagination links
        const queryParams = new URLSearchParams();
        if (search) queryParams.set('search', search);
        if (selectedCategory) queryParams.set('category', selectedCategory);
        if (req.query.limit && req.query.limit !== '10') queryParams.set('limit', req.query.limit);
        const baseQuery = queryParams.toString();

        res.render('product', {
            products,
            categories,
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
            baseQuery,
            // Filter data
            search,
            selectedCategory
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).render('product', {
            products: [],
            categories: [],
            error: 'Failed to load products',
            currentPage: 1,
            totalPages: 1,
            totalProducts: 0,
            hasNextPage: false,
            hasPrevPage: false,
            nextPage: null,
            prevPage: null,
            pageNumbers: [1],
            startResult: 0,
            endResult: 0,
            limit: 10,
            baseQuery: '',
            search: '',
            selectedCategory: ''
        });
    }
};

// Render add product page
const getAddProduct = async (req, res) => {
    try {
        const categories = await Category.find({
            isListed: true,
            $or: [
                { isDeleted: false },
                { isDeleted: { $exists: false } }
            ]
        });
        res.render('new-product', { categories, product: null });
    } catch (error) {
        console.error('Error loading add product page:', error);
        res.status(500).send('Server Error');
    }
};

// Render edit product page
const getEditProduct = async (req, res) => {
    try {
        const productId = req.params.id;
        const product = await Product.findById(productId).populate('category');
        const categories = await Category.find({
            isListed: true,
            $or: [
                { isDeleted: false },
                { isDeleted: { $exists: false } }
            ]
        });
        
        if (!product || product.isDeleted) {
            return res.status(404).send('Product not found');
        }
        
        res.render('edit-product', { product, categories });
    } catch (error) {
        console.error('Error loading edit product page:', error);
        res.status(500).send('Server Error');
    }
};

// Add new product
const addProduct = async (req, res) => {
    try {
        const {
            productName,
            description,
            brand,
            category,
            regularPrice,
            salePrice,
            productOffer,
            quantity,
            features,
            croppedImages,
            mainImageIndex
        } = req.body;

        // Validation
        if (!productName || !description || !brand || !category || !regularPrice || !salePrice || !features) {
            return res.status(400).json({ 
                success: false, 
                message: 'All required fields must be filled' 
            });
        }

        // Parse cropped images
        let imageData = [];
        try {
            imageData = JSON.parse(croppedImages || '[]');
        } catch (error) {
            return res.status(400).json({
                success: false,
                message: 'Invalid image data format'
            });
        }

        if (imageData.length < 3) {
            return res.status(400).json({ 
                success: false, 
                message: 'Minimum 3 images are required' 
            });
        }

        // Process and save cropped images
        const processedImages = [];
        for (let i = 0; i < imageData.length; i++) {
            const timestamp = Date.now();
            const filename = `product-${timestamp}-${i + 1}.jpg`;

            try {
                await saveBase64Image(imageData[i], filename);
                processedImages.push(filename);
            } catch (error) {
                // Clean up any already saved images
                processedImages.forEach(deleteImageFile);
                throw new Error(`Failed to process image ${i + 1}`);
            }
        }

        // Determine main image based on mainImageIndex
        const selectedMainIndex = parseInt(mainImageIndex) || 0;
        const validMainIndex = selectedMainIndex < processedImages.length ? selectedMainIndex : 0;

                
        // Arrange images with main image first
        const mainImageFile = processedImages[validMainIndex];
        const subImageFiles = processedImages.filter((_, index) => index !== validMainIndex);

        // Create product
        const newProduct = new Product({
            productName,
            description,
            brand,
            category,
            regularPrice: parseFloat(regularPrice),
            salePrice: parseFloat(salePrice),
            productOffer: parseFloat(productOffer) || 0,
            quantity: parseInt(quantity) || 1,
            features,
            mainImage: mainImageFile,
            subImages: subImageFiles,
            isDeleted: false,
            isBlocked: false,
            isListed: true
        });

        await newProduct.save();

        res.status(201).json({ 
            success: true, 
            message: 'Product added successfully',
            product: newProduct
        });

    } catch (error) {
        console.error('Error adding product:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add product: ' + error.message
        });
    }
};

// Get product by ID for editing
const getProductById = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id).populate('category');
        if (!product || product.isDeleted) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }
        res.json({ success: true, product });
    } catch (error) {
        console.error('Error fetching product:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch product'
        });
    }
};

// Update product
const updateProduct = async (req, res) => {
    try {
        const productId = req.params.id;
        const {
            productName,
            description,
            brand,
            category,
            regularPrice,
            salePrice,
            productOffer,
            quantity,
            features,
            croppedImages,
            removedImages,
            mainImage
        } = req.body;

        // Find existing product
        const existingProduct = await Product.findById(productId);
        if (!existingProduct || existingProduct.isDeleted) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // Prepare update data
        const updateData = {
            productName,
            description,
            brand,
            category,
            regularPrice: parseFloat(regularPrice),
            salePrice: parseFloat(salePrice),
            productOffer: parseFloat(productOffer) || 0,
            quantity: parseInt(quantity) || 0,
            features
        };

        // Handle image updates
        let currentImages = [existingProduct.mainImage, ...existingProduct.subImages];

        // Remove deleted images
        if (removedImages) {
            const toRemove = JSON.parse(removedImages);
            toRemove.forEach(filename => {
                deleteImageFile(filename);
                currentImages = currentImages.filter(img => img !== filename);
            });
        }

        // Add new cropped images
        let newImageFilenames = [];
        if (croppedImages) {
            const newImageData = JSON.parse(croppedImages);
            for (let i = 0; i < newImageData.length; i++) {
                const timestamp = Date.now();
                const filename = `product-${timestamp}-${i + 1}.jpg`;

                try {
                    await saveBase64Image(newImageData[i], filename);
                    newImageFilenames.push(filename);
                    currentImages.push(filename);
                } catch (error) {
                    console.error(`Failed to process new image ${i + 1}:`, error);
                }
            }
        }

        // Ensure minimum 3 images
        if (currentImages.length < 3) {
            return res.status(400).json({
                success: false,
                message: 'Product must have at least 3 images'
            });
        }

        // Handle main image selection
        let selectedMainImage;

        if (mainImage) {
            // Check if mainImage is a number (index for new images)
            if (!isNaN(mainImage)) {
                const newImageIndex = parseInt(mainImage);
                if (newImageIndex >= 0 && newImageIndex < newImageFilenames.length) {
                    selectedMainImage = newImageFilenames[newImageIndex];
                                    }
            } else {
                // It's an existing image filename
                if (currentImages.includes(mainImage)) {
                    selectedMainImage = mainImage;
                }
            }
        }

        // If no valid main image selected, use the first image
        if (!selectedMainImage) {
            selectedMainImage = currentImages[0];
                    }

        // Arrange images with selected main image first
        const subImages = currentImages.filter(img => img !== selectedMainImage);

        // Update image fields
        updateData.mainImage = selectedMainImage;
        updateData.subImages = subImages;

        const updatedProduct = await Product.findByIdAndUpdate(
            productId,
            updateData,
            { new: true, runValidators: true }
        );

        res.json({
            success: true,
            message: 'Product updated successfully',
            product: updatedProduct
        });

    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update product: ' + error.message
        });
    }
};

// Soft delete product
const deleteProduct = async (req, res) => {
    try {
        const productId = req.params.id;

        const product = await Product.findByIdAndUpdate(
            productId,
            {
                isDeleted: true,
                isListed: false
            },
            { new: true }
        );

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        res.json({
            success: true,
            message: 'Product deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete product'
        });
    }
};

// Toggle product status (block/unblock)
const toggleProductStatus = async (req, res) => {
    try {
        const productId = req.params.id;
        const product = await Product.findById(productId);

        if (!product || product.isDeleted) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        product.isBlocked = !product.isBlocked;
        product.isListed = !product.isBlocked;
        await product.save();

        res.json({
            success: true,
            message: `Product ${product.isBlocked ? 'blocked' : 'unblocked'} successfully`,
            isBlocked: product.isBlocked
        });

    } catch (error) {
        console.error('Error toggling product status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update product status'
        });
    }
};

// Get products for user dashboard
const getProductsForUser = async (req, res) => {
    try {
        const products = await Product.find({
            isDeleted: false,
            isBlocked: false,
            isListed: true
        })
        .populate({
            path: 'category',
            match: { isListed: true },
            select: 'name'
        })
        .sort({ createdAt: -1 })
        .limit(12)
        .lean();

        // Filter out products with unlisted categories
        const filteredProducts = products.filter(product => product.category !== null);

        res.json({ success: true, products: filteredProducts });
    } catch (error) {
        console.error('Error fetching products for user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch products'
        });
    }
};

module.exports = {
    getProducts,
    getAddProduct,
    getEditProduct,
    addProduct,
    getProductById,
    updateProduct,
    deleteProduct,
    toggleProductStatus,
    getProductsForUser
};
