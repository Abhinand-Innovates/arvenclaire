

/**
 * Validates coupon code field
 * @param {string} code - The coupon code to validate
 * @param {string} excludeId - ID to exclude when checking for existing codes (for updates)
 * @returns {object} - { isValid: boolean, error: string, field: string }
 */
const validateCouponCode = (code, excludeId = null) => {
    if (!code || code.trim() === '') {
        return {
            isValid: false,
            error: 'Coupon code is required',
            field: 'code'
        };
    }

    return {
        isValid: true,
        trimmedValue: code.toUpperCase().trim()
    };
};



/**
 * Validates description field
 * @param {string} description - The description to validate
 * @returns {object} - { isValid: boolean, error: string, field: string }
 */
const validateDescription = (description) => {
    if (!description || description.trim() === '') {
        return {
            isValid: false,
            error: 'Description is required',
            field: 'description'
        };
    }

    return {
        isValid: true,
        trimmedValue: description.trim()
    };
};



/**
 * Validates discount type field
 * @param {string} discountType - The discount type to validate
 * @returns {object} - { isValid: boolean, error: string, field: string }
 */
const validateDiscountType = (discountType) => {
    if (!discountType) {
        return {
            isValid: false,
            error: 'Please select a discount type',
            field: 'discountType'
        };
    }

    const validTypes = ['percentage', 'flat'];
    if (!validTypes.includes(discountType)) {
        return {
            isValid: false,
            error: 'Invalid discount type',
            field: 'discountType'
        };
    }

    return {
        isValid: true
    };
};




/**
 * Validates discount value field
 * @param {string} discount - The discount value to validate
 * @param {string} discountType - The discount type for context validation
 * @returns {object} - { isValid: boolean, error: string, field: string }
 */
const validateDiscount = (discount, discountType) => {
    if (!discount || discount === '') {
        return {
            isValid: false,
            error: 'Discount value is required',
            field: 'discount'
        };
    }

    const discountValue = parseFloat(discount);
    if (isNaN(discountValue) || discountValue <= 0) {
        return {
            isValid: false,
            error: 'Discount value must be greater than 0',
            field: 'discount'
        };
    }

    if (discountType === 'percentage' && discountValue > 100) {
        return {
            isValid: false,
            error: 'Percentage discount must be between 1 and 100',
            field: 'discount'
        };
    }

    return {
        isValid: true,
        parsedValue: discountValue
    };
};




/**
 * Validates minimum purchase amount field
 * @param {string} minPurchase - The minimum purchase amount to validate
 * @returns {object} - { isValid: boolean, error: string, field: string }
 */
const validateMinPurchase = (minPurchase) => {
    if (!minPurchase || minPurchase === '') {
        return {
            isValid: false,
            error: 'Minimum purchase amount is required',
            field: 'minPurchase'
        };
    }

    const minPurchaseValue = parseFloat(minPurchase);
    if (isNaN(minPurchaseValue) || minPurchaseValue < 0) {
        return {
            isValid: false,
            error: 'Minimum purchase amount must be a valid positive number',
            field: 'minPurchase'
        };
    }

    return {
        isValid: true,
        parsedValue: minPurchaseValue
    };
};




/**
 * Validates maximum discount amount field
 * @param {string} maxDiscount - The maximum discount amount to validate
 * @param {string} discountType - The discount type for context validation
 * @returns {object} - { isValid: boolean, error: string, field: string }
 */
const validateMaxDiscount = (maxDiscount, discountType) => {
    // Only required for percentage discount type
    if (discountType === 'percentage' && (!maxDiscount || maxDiscount === '')) {
        return {
            isValid: false,
            error: 'Maximum discount amount is required',
            field: 'maxDiscount'
        };
    }

    if (maxDiscount && (isNaN(parseFloat(maxDiscount)) || parseFloat(maxDiscount) <= 0)) {
        return {
            isValid: false,
            error: 'Maximum discount amount must be greater than 0',
            field: 'maxDiscount'
        };
    }

    return {
        isValid: true,
        parsedValue: maxDiscount ? parseFloat(maxDiscount) : null
    };
};




/**
 * Validates date fields
 * @param {string} startDate - The start date to validate
 * @param {string} expiry - The expiry date to validate
 * @returns {object} - { isValid: boolean, errors: array }
 */
const validateDates = (startDate, expiry) => {
    const errors = [];

    if (!startDate) {
        errors.push({
            error: 'Start date is required',
            field: 'startDate'
        });
    }

    if (!expiry) {
        errors.push({
            error: 'End date is required',
            field: 'expiry'
        });
    }

    if (startDate && expiry) {
        const start = new Date(startDate);
        const end = new Date(expiry);
        if (start >= end) {
            errors.push({
                error: 'End date must be after start date',
                field: 'expiry'
            });
        }
    }

    return {
        isValid: errors.length === 0,
        errors: errors,
        parsedStartDate: startDate ? new Date(startDate) : null,
        parsedExpiry: expiry ? new Date(expiry) : null
    };
};




/**
 * Validates usage limit field
 * @param {string} usageLimit - The usage limit to validate
 * @returns {object} - { isValid: boolean, error: string, field: string }
 */
const validateUsageLimit = (usageLimit) => {
    if (!usageLimit || usageLimit === '') {
        return {
            isValid: false,
            error: 'Global usage limit is required',
            field: 'usageLimit'
        };
    }

    const usageLimitValue = parseInt(usageLimit);
    if (isNaN(usageLimitValue) || usageLimitValue <= 0) {
        return {
            isValid: false,
            error: 'Global usage limit must be a positive number',
            field: 'usageLimit'
        };
    }

    return {
        isValid: true,
        parsedValue: usageLimitValue
    };
};




/**
 * Validates user usage limit field
 * @param {string} userUsageLimit - The user usage limit to validate
 * @returns {object} - { isValid: boolean, error: string, field: string }
 */
const validateUserUsageLimit = (userUsageLimit) => {
    if (!userUsageLimit || userUsageLimit === '') {
        return {
            isValid: false,
            error: 'Per user limit is required',
            field: 'userUsageLimit'
        };
    }

    const userUsageLimitValue = parseInt(userUsageLimit);
    if (isNaN(userUsageLimitValue) || userUsageLimitValue <= 0) {
        return {
            isValid: false,
            error: 'Per user limit must be a positive number',
            field: 'userUsageLimit'
        };
    }

    return {
        isValid: true,
        parsedValue: userUsageLimitValue
    };
};




/**
 * Validates flat discount business rule
 * @param {number} discountValue - The discount value
 * @param {number} minPurchaseValue - The minimum purchase value
 * @param {string} discountType - The discount type
 * @returns {object} - { isValid: boolean, errors: array }
 */
const validateFlatDiscountRule = (discountValue, minPurchaseValue, discountType) => {
    const errors = [];

    if (discountType === 'flat' && discountValue && minPurchaseValue) {
        if (!isNaN(discountValue) && !isNaN(minPurchaseValue) && minPurchaseValue <= discountValue) {
            errors.push({
                error: 'Minimum purchase amount must be greater than the flat discount amount',
                field: 'minPurchase'
            });
            errors.push({
                error: 'For flat discount, coupon value must be less than minimum purchase amount',
                field: 'discount'
            });
        }
    }

    return {
        isValid: errors.length === 0,
        errors: errors
    };
};




/**
 * Validates usage limit business rule
 * @param {number} globalLimit - The global usage limit
 * @param {number} perUserLimit - The per user usage limit
 * @returns {object} - { isValid: boolean, error: string, field: string }
 */
const validateUsageLimitRule = (globalLimit, perUserLimit) => {
    if (globalLimit && perUserLimit) {
        if (!isNaN(globalLimit) && !isNaN(perUserLimit) && perUserLimit > globalLimit) {
            return {
                isValid: false,
                error: 'Per user usage limit cannot exceed global usage limit',
                field: 'userUsageLimit'
            };
        }
    }

    return {
        isValid: true
    };
};




/**
 * Validates all coupon form fields for adding a new coupon
 * @param {object} formData - Object containing form fields
 * @returns {object} - { isValid: boolean, errors: object, validatedData: object }
 */
const validateAddCouponForm = (formData) => {
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
    } = formData;

    const errors = {};
    const validatedData = {};

    // Validate coupon code
    const codeValidation = validateCouponCode(code);
    if (!codeValidation.isValid) {
        errors[codeValidation.field] = codeValidation.error;
    } else {
        validatedData.code = codeValidation.trimmedValue;
    }

    // Validate description
    const descriptionValidation = validateDescription(description);
    if (!descriptionValidation.isValid) {
        errors[descriptionValidation.field] = descriptionValidation.error;
    } else {
        validatedData.description = descriptionValidation.trimmedValue;
    }

    // Validate discount type
    const discountTypeValidation = validateDiscountType(discountType);
    if (!discountTypeValidation.isValid) {
        errors[discountTypeValidation.field] = discountTypeValidation.error;
    } else {
        validatedData.discountType = discountType;
    }

    // Validate discount
    const discountValidation = validateDiscount(discount, discountType);
    if (!discountValidation.isValid) {
        errors[discountValidation.field] = discountValidation.error;
    } else {
        validatedData.discount = discountValidation.parsedValue;
    }

    // Validate minimum purchase
    const minPurchaseValidation = validateMinPurchase(minPurchase);
    if (!minPurchaseValidation.isValid) {
        errors[minPurchaseValidation.field] = minPurchaseValidation.error;
    } else {
        validatedData.minPurchase = minPurchaseValidation.parsedValue;
    }

    // Validate maximum discount
    const maxDiscountValidation = validateMaxDiscount(maxDiscount, discountType);
    if (!maxDiscountValidation.isValid) {
        errors[maxDiscountValidation.field] = maxDiscountValidation.error;
    } else {
        validatedData.maxDiscount = discountType === 'percentage' ? maxDiscountValidation.parsedValue : discountValidation.parsedValue;
    }

    // Validate dates
    const datesValidation = validateDates(startDate, expiry);
    if (!datesValidation.isValid) {
        datesValidation.errors.forEach(error => {
            errors[error.field] = error.error;
        });
    } else {
        validatedData.startDate = datesValidation.parsedStartDate;
        validatedData.expiry = datesValidation.parsedExpiry;
    }

    // Validate usage limit
    const usageLimitValidation = validateUsageLimit(usageLimit);
    if (!usageLimitValidation.isValid) {
        errors[usageLimitValidation.field] = usageLimitValidation.error;
    } else {
        validatedData.usageLimit = usageLimitValidation.parsedValue;
    }

    // Validate user usage limit
    const userUsageLimitValidation = validateUserUsageLimit(userUsageLimit);
    if (!userUsageLimitValidation.isValid) {
        errors[userUsageLimitValidation.field] = userUsageLimitValidation.error;
    } else {
        validatedData.userUsageLimit = userUsageLimitValidation.parsedValue;
    }

    // Validate flat discount business rule
    if (validatedData.discount && validatedData.minPurchase) {
        const flatDiscountRuleValidation = validateFlatDiscountRule(
            validatedData.discount,
            validatedData.minPurchase,
            discountType
        );
        if (!flatDiscountRuleValidation.isValid) {
            flatDiscountRuleValidation.errors.forEach(error => {
                errors[error.field] = error.error;
            });
        }
    }

    // Validate usage limit business rule
    if (validatedData.usageLimit && validatedData.userUsageLimit) {
        const usageLimitRuleValidation = validateUsageLimitRule(
            validatedData.usageLimit,
            validatedData.userUsageLimit
        );
        if (!usageLimitRuleValidation.isValid) {
            errors[usageLimitRuleValidation.field] = usageLimitRuleValidation.error;
        }
    }

    // Process other fields
    validatedData.isActive = isActive === 'on' || isActive === true;
    validatedData.applicableCategories = Array.isArray(applicableCategories) 
        ? applicableCategories.filter(id => id) 
        : (applicableCategories ? [applicableCategories] : []);
    validatedData.applicableProducts = Array.isArray(applicableProducts) 
        ? applicableProducts.filter(id => id) 
        : (applicableProducts ? [applicableProducts] : []);

    return {
        isValid: Object.keys(errors).length === 0,
        errors: errors,
        validatedData: validatedData
    };
};




/**
 * Validates all coupon form fields for updating an existing coupon
 * @param {object} formData - Object containing form fields
 * @param {string} couponId - ID of the coupon being updated
 * @returns {object} - { isValid: boolean, errors: object, validatedData: object }
 */
const validateUpdateCouponForm = (formData, couponId) => {
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
    } = formData;

    const errors = {};
    const validatedData = {};

    // Validate coupon code
    const codeValidation = validateCouponCode(code, couponId);
    if (!codeValidation.isValid) {
        errors[codeValidation.field] = codeValidation.error;
    } else {
        validatedData.code = codeValidation.trimmedValue;
    }

    // Validate description
    const descriptionValidation = validateDescription(description);
    if (!descriptionValidation.isValid) {
        errors[descriptionValidation.field] = descriptionValidation.error;
    } else {
        validatedData.description = descriptionValidation.trimmedValue;
    }

    // Validate discount type
    const discountTypeValidation = validateDiscountType(discountType);
    if (!discountTypeValidation.isValid) {
        errors[discountTypeValidation.field] = discountTypeValidation.error;
    } else {
        validatedData.discountType = discountType;
    }

    // Validate discount
    const discountValidation = validateDiscount(discount, discountType);
    if (!discountValidation.isValid) {
        errors[discountValidation.field] = discountValidation.error;
    } else {
        validatedData.discount = discountValidation.parsedValue;
    }

    // Validate minimum purchase
    const minPurchaseValidation = validateMinPurchase(minPurchase);
    if (!minPurchaseValidation.isValid) {
        errors[minPurchaseValidation.field] = minPurchaseValidation.error;
    } else {
        validatedData.minPurchase = minPurchaseValidation.parsedValue;
    }

    // For update, maxDiscount validation is slightly different
    if (!maxDiscount || maxDiscount === '') {
        errors.maxDiscount = 'Maximum discount amount is required';
    } else if (isNaN(parseFloat(maxDiscount)) || parseFloat(maxDiscount) <= 0) {
        errors.maxDiscount = 'Maximum discount amount must be greater than 0';
    } else {
        validatedData.maxDiscount = discountType === 'percentage' ? parseFloat(maxDiscount) : discountValidation.parsedValue;
    }

    // Validate dates
    const datesValidation = validateDates(startDate, expiry);
    if (!datesValidation.isValid) {
        datesValidation.errors.forEach(error => {
            errors[error.field] = error.error;
        });
    } else {
        validatedData.startDate = datesValidation.parsedStartDate;
        validatedData.expiry = datesValidation.parsedExpiry;
    }

    // Validate usage limit
    const usageLimitValidation = validateUsageLimit(usageLimit);
    if (!usageLimitValidation.isValid) {
        errors[usageLimitValidation.field] = usageLimitValidation.error;
    } else {
        validatedData.usageLimit = usageLimitValidation.parsedValue;
    }

    // Validate user usage limit
    const userUsageLimitValidation = validateUserUsageLimit(userUsageLimit);
    if (!userUsageLimitValidation.isValid) {
        errors[userUsageLimitValidation.field] = userUsageLimitValidation.error;
    } else {
        validatedData.userUsageLimit = userUsageLimitValidation.parsedValue;
    }

    // Validate flat discount business rule
    if (validatedData.discount && validatedData.minPurchase) {
        const flatDiscountRuleValidation = validateFlatDiscountRule(
            validatedData.discount,
            validatedData.minPurchase,
            discountType
        );
        if (!flatDiscountRuleValidation.isValid) {
            flatDiscountRuleValidation.errors.forEach(error => {
                errors[error.field] = error.error;
            });
        }
    }

    // Validate usage limit business rule
    if (validatedData.usageLimit && validatedData.userUsageLimit) {
        const usageLimitRuleValidation = validateUsageLimitRule(
            validatedData.usageLimit,
            validatedData.userUsageLimit
        );
        if (!usageLimitRuleValidation.isValid) {
            errors[usageLimitRuleValidation.field] = usageLimitRuleValidation.error;
        }
    }

    // Process other fields
    validatedData.isActive = isActive === 'on' || isActive === true;
    validatedData.applicableCategories = Array.isArray(applicableCategories) 
        ? applicableCategories.filter(id => id) 
        : (applicableCategories ? [applicableCategories] : []);
    validatedData.applicableProducts = Array.isArray(applicableProducts) 
        ? applicableProducts.filter(id => id) 
        : (applicableProducts ? [applicableProducts] : []);

    return {
        isValid: Object.keys(errors).length === 0,
        errors: errors,
        validatedData: validatedData
    };
};




/**
 * Checks if coupon code already exists in database
 * @param {string} code - The coupon code to check
 * @param {string} excludeId - ID to exclude when checking (for updates)
 * @param {object} CouponModel - The Coupon model for database queries
 * @returns {Promise<object>} - { exists: boolean, error: string }
 */
const checkCouponCodeExists = async (code, excludeId = null, CouponModel) => {
    try {
        const query = { code: code.toUpperCase().trim() };
        if (excludeId) {
            query._id = { $ne: excludeId };
        }

        const existingCoupon = await CouponModel.findOne(query);
        
        return {
            exists: !!existingCoupon,
            error: existingCoupon ? 'Coupon code already exists' : null
        };
    } catch (error) {
        return {
            exists: false,
            error: 'Error checking coupon code availability'
        };
    }
};




module.exports = {
    validateCouponCode,
    validateDescription,
    validateDiscountType,
    validateDiscount,
    validateMinPurchase,
    validateMaxDiscount,
    validateDates,
    validateUsageLimit,
    validateUserUsageLimit,
    validateFlatDiscountRule,
    validateUsageLimitRule,
    validateAddCouponForm,
    validateUpdateCouponForm,
    checkCouponCodeExists
};