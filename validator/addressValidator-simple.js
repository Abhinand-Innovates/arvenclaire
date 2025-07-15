/**
 * Simple address validator that matches the address schema exactly
 */

const validateAddAddressForm = (formData) => {
    const errors = {};
    const validatedData = {};

    // Validate full name (maps to 'name' in schema)
    if (!formData.fullName || formData.fullName.trim().length < 4) {
        errors.fullName = 'Full name must be at least 4 characters long';
    } else if (!/^[a-zA-Z\s]+$/.test(formData.fullName.trim())) {
        errors.fullName = 'Full name can only contain alphabets and spaces';
    } else {
        validatedData.name = formData.fullName.trim();
    }

    // Validate mobile number (maps to 'phone' in schema)
    if (!formData.mobileNumber || !/^[6-9]\d{9}$/.test(formData.mobileNumber.trim())) {
        errors.mobileNumber = 'Mobile number must be 10 digits and start with 6, 7, 8, or 9';
    } else {
        validatedData.phone = formData.mobileNumber.trim();
    }

    // Validate alternative phone (optional)
    if (formData.altPhone && formData.altPhone.trim()) {
        if (!/^[6-9]\d{9}$/.test(formData.altPhone.trim())) {
            errors.altPhone = 'Alternative phone must be 10 digits and start with 6, 7, 8, or 9';
        } else {
            validatedData.altPhone = formData.altPhone.trim();
        }
    } else {
        validatedData.altPhone = null;
    }

    // Validate address details (maps to 'landMark' in schema)
    if (!formData.addressDetails || formData.addressDetails.trim().length < 10) {
        errors.addressDetails = 'Address details must be at least 10 characters long';
    } else {
        validatedData.landMark = formData.addressDetails.trim();
    }

    // Validate city
    if (!formData.city || formData.city.trim().length < 2) {
        errors.city = 'City must be at least 2 characters long';
    } else if (!/^[a-zA-Z\s]+$/.test(formData.city.trim())) {
        errors.city = 'City can only contain alphabets and spaces';
    } else {
        validatedData.city = formData.city.trim();
    }

    // Validate state
    if (!formData.state || formData.state.trim().length < 2) {
        errors.state = 'State is required';
    } else {
        validatedData.state = formData.state.trim();
    }

    // Validate pincode
    if (!formData.pincode || !/^[1-9]\d{5}$/.test(formData.pincode.trim())) {
        errors.pincode = 'Pincode must be exactly 6 digits and cannot start with 0';
    } else {
        validatedData.pincode = parseInt(formData.pincode.trim());
    }

    // Validate address type
    if (!formData.addressType || !['home', 'office', 'other'].includes(formData.addressType.toLowerCase())) {
        errors.addressType = 'Address type must be home, office, or other';
    } else {
        validatedData.addressType = formData.addressType.toLowerCase();
    }

    // Handle make default
    validatedData.isDefault = formData.makeDefault === true || formData.makeDefault === 'true';

    return {
        isValid: Object.keys(errors).length === 0,
        errors: errors,
        validatedData: validatedData
    };
};

const validateUpdateAddressForm = (formData) => {
    return validateAddAddressForm(formData);
};

module.exports = {
    validateAddAddressForm,
    validateUpdateAddressForm
};