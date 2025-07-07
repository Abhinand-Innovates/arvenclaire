const Coupon = require('../../models/coupon-schema');
const Category = require('../../models/category-schema');



const getCouponsPage = async (req, res) => {
    try {
        const coupons = await Coupon.find({});
        res.render('coupons', { coupons });
    } catch (error) {
        console.error('Error fetching coupons:', error);
        res.status(500).send('Error fetching coupons');
    }
};




const getAddCouponPage = async (req, res) => {
    try {
        const categories = await Category.find({});
        const Product = require('../../models/product-schema');
        const products = await Product.find({});
        res.render('add-coupons', { 
            categories, 
            products,
            error: null,
            formData: {}
        });
    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).render('add-coupons', {
            categories: [],
            products: [],
            error: 'Error loading page. Please try again.',
            formData: {}
        });
    }
};




const addCoupon = async (req, res) => {
    try {
        // Extract and validate form data
        const {
            code,
            description,
            discountType,
            discount,
            minPurchase,
            maxDiscount,
            startDate,
            expiry,
            usageLimit,
            userUsageLimit,
            isActive,
            applicableCategories,
            applicableProducts
        } = req.body;

        // Validate required fields
        if (!code || !description || !discountType || !discount || !minPurchase || !maxDiscount || !startDate || !expiry || !usageLimit || !userUsageLimit) {
            return res.status(400).render('add-coupons', {
                categories: await Category.find({}),
                products: await require('../../models/product-schema').find({}),
                error: 'All required fields must be filled',
                formData: req.body
            });
        }

        // Validate dates
        const start = new Date(startDate);
        const end = new Date(expiry);
        if (start >= end) {
            return res.status(400).render('add-coupons', {
                categories: await Category.find({}),
                products: await require('../../models/product-schema').find({}),
                error: 'End date must be after start date',
                formData: req.body
            });
        }

        // Validate discount value based on type
        const discountValue = parseFloat(discount);
        if (discountType === 'percentage' && (discountValue <= 0 || discountValue > 100)) {
            return res.status(400).render('add-coupons', {
                categories: await Category.find({}),
                products: await require('../../models/product-schema').find({}),
                error: 'Percentage discount must be between 1 and 100',
                formData: req.body
            });
        }

        if (discountValue <= 0) {
            return res.status(400).render('add-coupons', {
                categories: await Category.find({}),
                products: await require('../../models/product-schema').find({}),
                error: 'Discount value must be greater than 0',
                formData: req.body
            });
        }

        // Check if coupon code already exists
        const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
        if (existingCoupon) {
            return res.status(400).render('add-coupons', {
                categories: await Category.find({}),
                products: await require('../../models/product-schema').find({}),
                error: 'Coupon code already exists',
                formData: req.body
            });
        }

        // Prepare coupon data with proper data types
        const couponData = {
            code: code.toUpperCase().trim(),
            description: description.trim(),
            discountType,
            discount: parseFloat(discount),
            minPurchase: parseFloat(minPurchase),
            maxDiscount: parseFloat(maxDiscount),
            startDate: new Date(startDate),
            expiry: new Date(expiry),
            usageLimit: parseInt(usageLimit),
            userUsageLimit: parseInt(userUsageLimit),
            isActive: isActive === 'on' || isActive === true,
            applicableCategories: Array.isArray(applicableCategories) ? applicableCategories.filter(id => id) : (applicableCategories ? [applicableCategories] : []),
            applicableProducts: Array.isArray(applicableProducts) ? applicableProducts.filter(id => id) : (applicableProducts ? [applicableProducts] : [])
        };

        const newCoupon = new Coupon(couponData);
        await newCoupon.save();
        
        res.redirect('/coupons?success=Coupon added successfully');
    } catch (error) {
        console.error('Error adding coupon:', error);
        
        // Handle validation errors
        if (error.name === 'ValidationError') {
            const errorMessages = Object.values(error.errors).map(err => err.message);
            return res.status(400).render('add-coupons', {
                categories: await Category.find({}),
                products: await require('../../models/product-schema').find({}),
                error: errorMessages.join(', '),
                formData: req.body
            });
        }

        res.status(500).render('add-coupons', {
            categories: await Category.find({}),
            products: await require('../../models/product-schema').find({}),
            error: 'Error adding coupon. Please try again.',
            formData: req.body
        });
    }
};




const getEditCouponPage = async (req, res) => {
    try {
        const couponId = req.params.id;
        const coupon = await Coupon.findById(couponId);
        
        if (!coupon) {
            return res.status(404).render('error', { message: 'Coupon not found' });
        }

        const categories = await Category.find({});
        const Product = require('../../models/product-schema');
        const products = await Product.find({});
        
        res.render('edit-coupon', { 
            coupon,
            categories, 
            products,
            error: null
        });
    } catch (error) {
        console.error('Error fetching coupon for edit:', error);
        res.status(500).render('error', { message: 'Error loading coupon for editing' });
    }
};




const updateCoupon = async (req, res) => {
    try {
        const couponId = req.params.id;
        const {
            code,
            description,
            discountType,
            discount,
            minPurchase,
            maxDiscount,
            startDate,
            expiry,
            usageLimit,
            userUsageLimit,
            isActive,
            applicableCategories,
            applicableProducts
        } = req.body;

        // Validate required fields
        if (!code || !description || !discountType || !discount || !minPurchase || !maxDiscount || !startDate || !expiry || !usageLimit || !userUsageLimit) {
            const categories = await Category.find({});
            const Product = require('../../models/product-schema');
            const products = await Product.find({});
            const coupon = await Coupon.findById(couponId);
            
            return res.status(400).render('edit-coupon', {
                coupon,
                categories,
                products,
                error: 'All required fields must be filled'
            });
        }

        // Validate dates
        const start = new Date(startDate);
        const end = new Date(expiry);
        if (start >= end) {
            const categories = await Category.find({});
            const Product = require('../../models/product-schema');
            const products = await Product.find({});
            const coupon = await Coupon.findById(couponId);
            
            return res.status(400).render('edit-coupon', {
                coupon,
                categories,
                products,
                error: 'End date must be after start date'
            });
        }

        // Validate discount value based on type
        const discountValue = parseFloat(discount);
        if (discountType === 'percentage' && (discountValue <= 0 || discountValue > 100)) {
            const categories = await Category.find({});
            const Product = require('../../models/product-schema');
            const products = await Product.find({});
            const coupon = await Coupon.findById(couponId);
            
            return res.status(400).render('edit-coupon', {
                coupon,
                categories,
                products,
                error: 'Percentage discount must be between 1 and 100'
            });
        }

        if (discountValue <= 0) {
            const categories = await Category.find({});
            const Product = require('../../models/product-schema');
            const products = await Product.find({});
            const coupon = await Coupon.findById(couponId);
            
            return res.status(400).render('edit-coupon', {
                coupon,
                categories,
                products,
                error: 'Discount value must be greater than 0'
            });
        }

        // Check if coupon code already exists (excluding current coupon)
        const existingCoupon = await Coupon.findOne({ 
            code: code.toUpperCase(),
            _id: { $ne: couponId }
        });
        
        if (existingCoupon) {
            const categories = await Category.find({});
            const Product = require('../../models/product-schema');
            const products = await Product.find({});
            const coupon = await Coupon.findById(couponId);
            
            return res.status(400).render('edit-coupon', {
                coupon,
                categories,
                products,
                error: 'Coupon code already exists'
            });
        }

        // Prepare update data
        const updateData = {
            code: code.toUpperCase().trim(),
            description: description.trim(),
            discountType,
            discount: parseFloat(discount),
            minPurchase: parseFloat(minPurchase),
            maxDiscount: parseFloat(maxDiscount),
            startDate: new Date(startDate),
            expiry: new Date(expiry),
            usageLimit: parseInt(usageLimit),
            userUsageLimit: parseInt(userUsageLimit),
            isActive: isActive === 'on' || isActive === true,
            applicableCategories: Array.isArray(applicableCategories) ? applicableCategories.filter(id => id) : (applicableCategories ? [applicableCategories] : []),
            applicableProducts: Array.isArray(applicableProducts) ? applicableProducts.filter(id => id) : (applicableProducts ? [applicableProducts] : [])
        };

        const updatedCoupon = await Coupon.findByIdAndUpdate(couponId, updateData, { new: true });
        
        if (!updatedCoupon) {
            const categories = await Category.find({});
            const Product = require('../../models/product-schema');
            const products = await Product.find({});
            const coupon = await Coupon.findById(couponId);
            
            return res.status(404).render('edit-coupon', {
                coupon,
                categories,
                products,
                error: 'Coupon not found'
            });
        }

        res.redirect('/coupons?success=Coupon updated successfully');
    } catch (error) {
        console.error('Error updating coupon:', error);
        
        try {
            const categories = await Category.find({});
            const Product = require('../../models/product-schema');
            const products = await Product.find({});
            const coupon = await Coupon.findById(req.params.id);
            
            if (error.name === 'ValidationError') {
                const errorMessages = Object.values(error.errors).map(err => err.message);
                return res.status(400).render('edit-coupon', {
                    coupon,
                    categories,
                    products,
                    error: errorMessages.join(', ')
                });
            }

            res.status(500).render('edit-coupon', {
                coupon,
                categories,
                products,
                error: 'Error updating coupon. Please try again.'
            });
        } catch (renderError) {
            console.error('Error rendering error page:', renderError);
            res.status(500).send('Error updating coupon. Please try again.');
        }
    }
};




const toggleCouponStatus = async (req, res) => {
    try {
        const couponId = req.params.id;
        const coupon = await Coupon.findById(couponId);
        
        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }

        coupon.isActive = !coupon.isActive;
        await coupon.save();

        res.json({
            success: true,
            message: `Coupon ${coupon.isActive ? 'activated' : 'deactivated'} successfully`,
            isActive: coupon.isActive
        });
    } catch (error) {
        console.error('Error toggling coupon status:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating coupon status'
        });
    }
};




const deleteCoupon = async (req, res) => {
    try {
        const couponId = req.params.id;
        const coupon = await Coupon.findById(couponId);
        
        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }

        // Check if coupon has been used
        if (coupon.usedCount > 0) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete coupon that has been used'
            });
        }

        await Coupon.findByIdAndDelete(couponId);

        res.json({
            success: true,
            message: 'Coupon deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting coupon:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting coupon'
        });
    }
};




module.exports = {
    getCouponsPage,
    getAddCouponPage,
    addCoupon,
    getEditCouponPage,
    updateCoupon,
    toggleCouponStatus,
    deleteCoupon
};