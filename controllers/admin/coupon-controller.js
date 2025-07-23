// Admin coupon management controller
const Coupon = require('../../models/coupon-schema');
const Category = require('../../models/category-schema');
const { 
    validateAddCouponForm, 
    validateUpdateCouponForm, 
    checkCouponCodeExists 
} = require('../../validator/couponValidator');

const getCouponsPage = async (req, res) => {
    try {
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
        const validation = validateAddCouponForm(req.body);
        
        if (!validation.isValid) {
            const categories = await Category.find({});
            const Product = require('../../models/product-schema');
            const products = await Product.find({});
            
            return res.status(400).render('add-coupons', {
                categories,
                products,
                errors: validation.errors,
                formData: req.body
            });
        }

        const codeCheck = await checkCouponCodeExists(validation.validatedData.code, null, Coupon);
        if (codeCheck.exists) {
            const categories = await Category.find({});
            const Product = require('../../models/product-schema');
            const products = await Product.find({});
            
            return res.status(400).render('add-coupons', {
                categories,
                products,
                errors: { code: codeCheck.error },
                formData: req.body
            });
        }

        const newCoupon = new Coupon(validation.validatedData);
        await newCoupon.save();
        
        res.redirect('/coupons?success=Coupon added successfully');
    } catch (error) {
        console.error('Error adding coupon:', error);
        
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
        const validation = validateUpdateCouponForm(req.body, couponId);
        
        if (!validation.isValid) {
            const categories = await Category.find({});
            const Product = require('../../models/product-schema');
            const products = await Product.find({});
            const coupon = await Coupon.findById(couponId);
            
            return res.status(400).render('edit-coupon', {
                coupon,
                categories,
                products,
                errors: validation.errors
            });
        }

        const codeCheck = await checkCouponCodeExists(validation.validatedData.code, couponId, Coupon);
        if (codeCheck.exists) {
            const categories = await Category.find({});
            const Product = require('../../models/product-schema');
            const products = await Product.find({});
            const coupon = await Coupon.findById(couponId);
            
            return res.status(400).render('edit-coupon', {
                coupon,
                categories,
                products,
                errors: { code: codeCheck.error }
            });
        }

        const updatedCoupon = await Coupon.findByIdAndUpdate(couponId, validation.validatedData, { new: true });
        
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

        if (coupon.isDeleted) {
            return res.status(400).json({
                success: false,
                message: 'Coupon is already deleted'
            });
        }

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