const Coupon = require('../../models/coupon-schema');
const Category = require('../../models/category-schema');



const getCouponsPage = async (req, res) => {
    try {
        // Only fetch non-deleted coupons
        const coupons = await Coupon.find({ isDeleted: false });
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
            errors: {},
            formData: {}
        });
    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).render('add-coupons', {
            categories: [],
            products: [],
            errors: { general: 'Error loading page. Please try again.' },
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

        const errors = {};

        // Validate required fields
        if (!code || code.trim() === '') {
            errors.code = 'Coupon code is required';
        }
        if (!description || description.trim() === '') {
            errors.description = 'Description is required';
        }
        if (!discountType) {
            errors.discountType = 'Please select a discount type';
        }
        if (!discount || discount === '') {
            errors.discount = 'Discount value is required';
        }
        if (!minPurchase || minPurchase === '') {
            errors.minPurchase = 'Minimum purchase amount is required';
        }
        // Only validate maxDiscount for percentage discount type
        if (discountType === 'percentage' && (!maxDiscount || maxDiscount === '')) {
            errors.maxDiscount = 'Maximum discount amount is required';
        }
        if (!startDate) {
            errors.startDate = 'Start date is required';
        }
        if (!expiry) {
            errors.expiry = 'End date is required';
        }
        if (!usageLimit || usageLimit === '') {
            errors.usageLimit = 'Global usage limit is required';
        }
        if (!userUsageLimit || userUsageLimit === '') {
            errors.userUsageLimit = 'Per user limit is required';
        }

        // Validate dates
        if (startDate && expiry) {
            const start = new Date(startDate);
            const end = new Date(expiry);
            if (start >= end) {
                errors.expiry = 'End date must be after start date';
            }
        }

        // Validate discount value based on type
        if (discount && discountType) {
            const discountValue = parseFloat(discount);
            if (isNaN(discountValue) || discountValue <= 0) {
                errors.discount = 'Discount value must be greater than 0';
            } else if (discountType === 'percentage' && discountValue > 100) {
                errors.discount = 'Percentage discount must be between 1 and 100';
            }
        }

        // Validate numeric fields
        if (minPurchase && (isNaN(parseFloat(minPurchase)) || parseFloat(minPurchase) < 0)) {
            errors.minPurchase = 'Minimum purchase amount must be a valid positive number';
        }
        if (maxDiscount && (isNaN(parseFloat(maxDiscount)) || parseFloat(maxDiscount) <= 0)) {
            errors.maxDiscount = 'Maximum discount amount must be greater than 0';
        }
        if (usageLimit && (isNaN(parseInt(usageLimit)) || parseInt(usageLimit) <= 0)) {
            errors.usageLimit = 'Global usage limit must be a positive number';
        }
        if (userUsageLimit && (isNaN(parseInt(userUsageLimit)) || parseInt(userUsageLimit) <= 0)) {
            errors.userUsageLimit = 'Per user limit must be a positive number';
        }

        // Validate flat discount type: minimum purchase must be greater than coupon value
        if (discountType === 'flat' && discount && minPurchase) {
            const discountValue = parseFloat(discount);
            const minPurchaseValue = parseFloat(minPurchase);
            
            if (!isNaN(discountValue) && !isNaN(minPurchaseValue) && minPurchaseValue <= discountValue) {
                errors.minPurchase = 'Minimum purchase amount must be greater than the flat discount amount';
                errors.discount = 'For flat discount, coupon value must be less than minimum purchase amount';
            }
        }

        // Validate that per user usage limit doesn't exceed global usage limit
        if (usageLimit && userUsageLimit) {
            const globalLimit = parseInt(usageLimit);
            const perUserLimit = parseInt(userUsageLimit);
            
            if (!isNaN(globalLimit) && !isNaN(perUserLimit) && perUserLimit > globalLimit) {
                errors.userUsageLimit = 'Per user usage limit cannot exceed global usage limit';
            }
        }

        // Check if coupon code already exists
        if (code && code.trim() !== '') {
            const existingCoupon = await Coupon.findOne({ code: code.toUpperCase().trim() });
            if (existingCoupon) {
                errors.code = 'Coupon code already exists';
            }
        }

        // If there are validation errors, return to form
        if (Object.keys(errors).length > 0) {
            const categories = await Category.find({});
            const Product = require('../../models/product-schema');
            const products = await Product.find({});
            
            return res.status(400).render('add-coupons', {
                categories,
                products,
                errors,
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
            maxDiscount: discountType === 'percentage' ? parseFloat(maxDiscount) : parseFloat(discount), // For flat discount, maxDiscount equals discount value
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
            const errors = {};
            Object.keys(error.errors).forEach(key => {
                errors[key] = error.errors[key].message;
            });
            return res.status(400).render('add-coupons', {
                categories: await Category.find({}),
                products: await require('../../models/product-schema').find({}),
                errors,
                formData: req.body
            });
        }

        res.status(500).render('add-coupons', {
            categories: await Category.find({}),
            products: await require('../../models/product-schema').find({}),
            errors: { general: 'Error adding coupon. Please try again.' },
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
            errors: {}
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

        const errors = {};

        // Validate required fields
        if (!code || code.trim() === '') {
            errors.code = 'Coupon code is required';
        }
        if (!description || description.trim() === '') {
            errors.description = 'Description is required';
        }
        if (!discountType) {
            errors.discountType = 'Please select a discount type';
        }
        if (!discount || discount === '') {
            errors.discount = 'Discount value is required';
        }
        if (!minPurchase || minPurchase === '') {
            errors.minPurchase = 'Minimum purchase amount is required';
        }
        // Only validate maxDiscount for percentage discount type
        if (discountType === 'percentage' && (!maxDiscount || maxDiscount === '')) {
            errors.maxDiscount = 'Maximum discount amount is required';
        }
        if (!startDate) {
            errors.startDate = 'Start date is required';
        }
        if (!expiry) {
            errors.expiry = 'End date is required';
        }
        if (!usageLimit || usageLimit === '') {
            errors.usageLimit = 'Global usage limit is required';
        }
        if (!userUsageLimit || userUsageLimit === '') {
            errors.userUsageLimit = 'Per user limit is required';
        }

        // Validate dates
        if (startDate && expiry) {
            const start = new Date(startDate);
            const end = new Date(expiry);
            if (start >= end) {
                errors.expiry = 'End date must be after start date';
            }
        }

        // Validate discount value based on type
        if (discount && discountType) {
            const discountValue = parseFloat(discount);
            if (isNaN(discountValue) || discountValue <= 0) {
                errors.discount = 'Discount value must be greater than 0';
            } else if (discountType === 'percentage' && discountValue > 100) {
                errors.discount = 'Percentage discount must be between 1 and 100';
            }
        }

        // Validate numeric fields
        if (minPurchase && (isNaN(parseFloat(minPurchase)) || parseFloat(minPurchase) < 0)) {
            errors.minPurchase = 'Minimum purchase amount must be a valid positive number';
        }
        if (maxDiscount && (isNaN(parseFloat(maxDiscount)) || parseFloat(maxDiscount) <= 0)) {
            errors.maxDiscount = 'Maximum discount amount must be greater than 0';
        }
        if (usageLimit && (isNaN(parseInt(usageLimit)) || parseInt(usageLimit) <= 0)) {
            errors.usageLimit = 'Global usage limit must be a positive number';
        }
        if (userUsageLimit && (isNaN(parseInt(userUsageLimit)) || parseInt(userUsageLimit) <= 0)) {
            errors.userUsageLimit = 'Per user limit must be a positive number';
        }

        // Validate flat discount type: minimum purchase must be greater than coupon value
        if (discountType === 'flat' && discount && minPurchase) {
            const discountValue = parseFloat(discount);
            const minPurchaseValue = parseFloat(minPurchase);
            
            if (!isNaN(discountValue) && !isNaN(minPurchaseValue) && minPurchaseValue <= discountValue) {
                errors.minPurchase = 'Minimum purchase amount must be greater than the flat discount amount';
                errors.discount = 'For flat discount, coupon value must be less than minimum purchase amount';
            }
        }

        // Validate that per user usage limit doesn't exceed global usage limit
        if (usageLimit && userUsageLimit) {
            const globalLimit = parseInt(usageLimit);
            const perUserLimit = parseInt(userUsageLimit);
            
            if (!isNaN(globalLimit) && !isNaN(perUserLimit) && perUserLimit > globalLimit) {
                errors.userUsageLimit = 'Per user usage limit cannot exceed global usage limit';
            }
        }

        // Check if coupon code already exists (excluding current coupon)
        if (code && code.trim() !== '') {
            const existingCoupon = await Coupon.findOne({ 
                code: code.toUpperCase().trim(),
                _id: { $ne: couponId }
            });
            
            if (existingCoupon) {
                errors.code = 'Coupon code already exists';
            }
        }

        // If there are validation errors, return to form
        if (Object.keys(errors).length > 0) {
            const categories = await Category.find({});
            const Product = require('../../models/product-schema');
            const products = await Product.find({});
            const coupon = await Coupon.findById(couponId);
            
            return res.status(400).render('edit-coupon', {
                coupon,
                categories,
                products,
                errors
            });
        }

        // Prepare update data
        const updateData = {
            code: code.toUpperCase().trim(),
            description: description.trim(),
            discountType,
            discount: parseFloat(discount),
            minPurchase: parseFloat(minPurchase),
            maxDiscount: discountType === 'percentage' ? parseFloat(maxDiscount) : parseFloat(discount),
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
                errors: { general: 'Coupon not found' }
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
                const errors = {};
                Object.keys(error.errors).forEach(key => {
                    errors[key] = error.errors[key].message;
                });
                return res.status(400).render('edit-coupon', {
                    coupon,
                    categories,
                    products,
                    errors
                });
            }

            res.status(500).render('edit-coupon', {
                coupon,
                categories,
                products,
                errors: { general: 'Error updating coupon. Please try again.' }
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

        // Check if coupon is already deleted
        if (coupon.isDeleted) {
            return res.status(400).json({
                success: false,
                message: 'Coupon is already deleted'
            });
        }

        // Perform soft delete - no conditions checked as per requirement
        coupon.isDeleted = true;
        coupon.deletedAt = new Date();
        await coupon.save();

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