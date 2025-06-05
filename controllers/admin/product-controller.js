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
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const skip = (page - 1) * limit;

        const searchQuery = { isDeleted: false };

        // Add search functionality
        if (req.query.search) {
            searchQuery.$or = [
                { productName: { $regex: req.query.search, $options: 'i' } },
                { brand: { $regex: req.query.search, $options: 'i' } }
            ];
        }

        // Add category filter
        if (req.query.category) {
            searchQuery.category = req.query.category;
        }

        // Fetch products and categories in parallel
        const [products, totalProducts, categories] = await Promise.all([
            Product.find(searchQuery)
                .populate('category', 'name')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Product.countDocuments(searchQuery),
            Category.find({ isListed: true }).sort({ name: 1 })
        ]);

        // Get product count for each category
        const categoriesWithCount = await Promise.all(
            categories.map(async (category) => {
                const productCount = await Product.countDocuments({
                    category: category._id,
                    isDeleted: false
                });
                return {
                    ...category.toObject(),
                    productCount
                };
            })
        );

        const totalPages = Math.ceil(totalProducts / limit);

        res.render('product', {
            products,
            categories: categoriesWithCount,
            currentPage: page,
            totalPages,
            totalProducts,
            search: req.query.search || '',
            selectedCategory: req.query.category || ''
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
            search: '',
            selectedCategory: ''
        });
    }
};

// Render add product page
const getAddProduct = async (req, res) => {
    try {
        const categories = await Category.find({ isListed: true });
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
        const categories = await Category.find({ isListed: true });
        
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
            croppedImages
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
            mainImage: processedImages[0],
            subImages: processedImages.slice(1),
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
            removedImages
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
            quantity: parseInt(quantity) || 1,
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
        if (croppedImages) {
            const newImageData = JSON.parse(croppedImages);
            for (let i = 0; i < newImageData.length; i++) {
                const timestamp = Date.now();
                const filename = `product-${timestamp}-${i + 1}.jpg`;

                try {
                    await saveBase64Image(newImageData[i], filename);
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

        // Update image fields
        updateData.mainImage = currentImages[0];
        updateData.subImages = currentImages.slice(1);

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
        .populate('category', 'name')
        .sort({ createdAt: -1 })
        .limit(12);

        res.json({ success: true, products });
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
