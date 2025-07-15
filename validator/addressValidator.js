/**
 * Validates full name field for address
 * @param {string} fullName - The full name to validate
 * @returns {object} - { isValid: boolean, error: string, field: string }
 */
const validateAddressFullName = (fullName) => {
    if (!fullName || fullName.trim() === '') {
        return {
            isValid: false,
            error: 'Full name is required',
            field: 'fullName'
        };
    }

    const trimmedFullName = fullName.trim();
    
    if (trimmedFullName.length < 4) {
        return {
            isValid: false,
            error: 'Full name must be at least 4 characters long',
            field: 'fullName'
        };
    }

    if (!/^[a-zA-Z\s]+$/.test(trimmedFullName)) {
        return {
            isValid: false,
            error: 'Full name can only contain alphabets and spaces',
            field: 'fullName'
        };
    }

    return {
        isValid: true,
        trimmedValue: trimmedFullName
    };
};



/**
 * Validates mobile number field
 * @param {string} mobileNumber - The mobile number to validate
 * @returns {object} - { isValid: boolean, error: string, field: string }
 */
const validateMobileNumber = (mobileNumber) => {
    if (!mobileNumber || mobileNumber.trim() === '') {
        return {
            isValid: false,
            error: 'Mobile number is required',
            field: 'mobileNumber'
        };
    }

    const mobileRegex = /^[6-9]\d{9}$/;
    if (!mobileRegex.test(mobileNumber.trim())) {
        return {
            isValid: false,
            error: 'Mobile number must be 10 digits and start with 6, 7, 8, or 9',
            field: 'mobileNumber'
        };
    }

    return {
        isValid: true,
        trimmedValue: mobileNumber.trim()
    };
};



/**
 * Validates alternative phone number field (optional)
 * @param {string} altPhone - The alternative phone number to validate
 * @returns {object} - { isValid: boolean, error: string, field: string }
 */
const validateAltPhone = (altPhone) => {
    // Alternative phone is optional
    if (!altPhone || altPhone.trim() === '') {
        return {
            isValid: true,
            trimmedValue: null
        };
    }

    const mobileRegex = /^[6-9]\d{9}$/;
    if (!mobileRegex.test(altPhone.trim())) {
        return {
            isValid: false,
            error: 'Alternative phone must be 10 digits and start with 6, 7, 8, or 9',
            field: 'altPhone'
        };
    }

    return {
        isValid: true,
        trimmedValue: altPhone.trim()
    };
};



/**
 * Validates address details field
 * @param {string} addressDetails - The address details to validate
 * @returns {object} - { isValid: boolean, error: string, field: string }
 */
const validateAddressDetails = (addressDetails) => {
    if (!addressDetails || addressDetails.trim() === '') {
        return {
            isValid: false,
            error: 'Address details are required',
            field: 'addressDetails'
        };
    }

    if (addressDetails.trim().length < 10) {
        return {
            isValid: false,
            error: 'Address details must be at least 10 characters long',
            field: 'addressDetails'
        };
    }

    return {
        isValid: true,
        trimmedValue: addressDetails.trim()
    };
};



/**
 * Validates city field
 * @param {string} city - The city to validate
 * @returns {object} - { isValid: boolean, error: string, field: string }
 */
const validateCity = (city) => {
    if (!city || city.trim() === '') {
        return {
            isValid: false,
            error: 'City is required',
            field: 'city'
        };
    }

    const trimmedCity = city.trim();
    
    if (trimmedCity.length < 2) {
        return {
            isValid: false,
            error: 'City must be at least 2 characters long',
            field: 'city'
        };
    }

    if (!/^[a-zA-Z\s]+$/.test(trimmedCity)) {
        return {
            isValid: false,
            error: 'City can only contain alphabets and spaces',
            field: 'city'
        };
    }

    return {
        isValid: true,
        trimmedValue: trimmedCity
    };
};



/**
 * Validates state field
 * @param {string} state - The state to validate
 * @returns {object} - { isValid: boolean, error: string, field: string }
 */
const validateState = (state) => {
    if (!state || state.trim() === '') {
        return {
            isValid: false,
            error: 'State is required',
            field: 'state'
        };
    }

    const trimmedState = state.trim();
    
    if (trimmedState.length < 2) {
        return {
            isValid: false,
            error: 'State must be at least 2 characters long',
            field: 'state'
        };
    }

    if (!/^[a-zA-Z\s]+$/.test(trimmedState)) {
        return {
            isValid: false,
            error: 'State can only contain alphabets and spaces',
            field: 'state'
        };
    }

    return {
        isValid: true,
        trimmedValue: trimmedState
    };
};



/**
 * Validates pincode field
 * @param {string} pincode - The pincode to validate
 * @returns {object} - { isValid: boolean, error: string, field: string }
 */
const validatePincode = (pincode) => {
    if (!pincode || pincode.trim() === '') {
        return {
            isValid: false,
            error: 'Pincode is required',
            field: 'pincode'
        };
    }

    // Pincode must be exactly 6 digits and cannot start with 0
    const pincodeRegex = /^[1-9]\d{5}$/;
    if (!pincodeRegex.test(pincode.trim())) {
        return {
            isValid: false,
            error: 'Pincode must be exactly 6 digits and cannot start with 0',
            field: 'pincode'
        };
    }

    return {
        isValid: true,
        parsedValue: parseInt(pincode.trim())
    };
};



/**
 * Validates landmark field (optional)
 * @param {string} landmark - The landmark to validate
 * @returns {object} - { isValid: boolean, error: string, field: string }
 */
const validateLandmark = (landmark) => {
    // Landmark is optional
    if (!landmark || landmark.trim() === '') {
        return {
            isValid: true,
            trimmedValue: null
        };
    }

    return {
        isValid: true,
        trimmedValue: landmark.trim()
    };
};



/**
 * Validates address type field
 * @param {string} addressType - The address type to validate
 * @returns {object} - { isValid: boolean, error: string, field: string }
 */
const validateAddressType = (addressType) => {
    if (!addressType || addressType.trim() === '') {
        return {
            isValid: false,
            error: 'Address type is required',
            field: 'addressType'
        };
    }

    const validTypes = ['home', 'office', 'other'];
    if (!validTypes.includes(addressType.toLowerCase())) {
        return {
            isValid: false,
            error: 'Invalid address type. Must be home, office, or other',
            field: 'addressType'
        };
    }

    return {
        isValid: true
    };
};



/**
 * Validates make default field
 * @param {string|boolean} makeDefault - The make default value to validate
 * @returns {object} - { isValid: boolean, parsedValue: boolean }
 */
const validateMakeDefault = (makeDefault) => {
    const isDefault = makeDefault === 'true' || makeDefault === true;
    
    return {
        isValid: true,
        parsedValue: isDefault
    };
};




/**
 * Validates all address form fields for adding a new address
 * @param {object} formData - Object containing form fields
 * @returns {object} - { isValid: boolean, errors: object, validatedData: object }
 */
const validateAddAddressForm = (formData) => {
    const {
        fullName,
        mobileNumber,
        addressDetails,
        city,
        state,
        pincode,
        landmark,
        addressType,
        altPhone,
        makeDefault
    } = formData;

    const errors = {};
    const validatedData = {};

    // Validate full name
    const fullNameValidation = validateAddressFullName(fullName);
    if (!fullNameValidation.isValid) {
        errors[fullNameValidation.field] = fullNameValidation.error;
    } else {
        validatedData.name = fullNameValidation.trimmedValue;
    }

    // Validate mobile number
    const mobileValidation = validateMobileNumber(mobileNumber);
    if (!mobileValidation.isValid) {
        errors[mobileValidation.field] = mobileValidation.error;
    } else {
        validatedData.phone = mobileValidation.trimmedValue;
    }

    // Validate alternative phone
    const altPhoneValidation = validateAltPhone(altPhone);
    if (!altPhoneValidation.isValid) {
        errors[altPhoneValidation.field] = altPhoneValidation.error;
    } else {
        validatedData.altPhone = altPhoneValidation.trimmedValue;
    }

    // Validate address details
    const addressDetailsValidation = validateAddressDetails(addressDetails);
    if (!addressDetailsValidation.isValid) {
        errors[addressDetailsValidation.field] = addressDetailsValidation.error;
    } else {
        validatedData.landMark = addressDetailsValidation.trimmedValue;
    }

    // Validate city
    const cityValidation = validateCity(city);
    if (!cityValidation.isValid) {
        errors[cityValidation.field] = cityValidation.error;
    } else {
        validatedData.city = cityValidation.trimmedValue;
    }

    // Validate state
    const stateValidation = validateState(state);
    if (!stateValidation.isValid) {
        errors[stateValidation.field] = stateValidation.error;
    } else {
        validatedData.state = stateValidation.trimmedValue;
    }

    // Validate pincode
    const pincodeValidation = validatePincode(pincode);
    if (!pincodeValidation.isValid) {
        errors[pincodeValidation.field] = pincodeValidation.error;
    } else {
        validatedData.pincode = pincodeValidation.parsedValue;
    }

    // Validate landmark (optional)
    const landmarkValidation = validateLandmark(landmark);
    if (!landmarkValidation.isValid) {
        errors[landmarkValidation.field] = landmarkValidation.error;
    }

    // Validate address type
    const addressTypeValidation = validateAddressType(addressType);
    if (!addressTypeValidation.isValid) {
        errors[addressTypeValidation.field] = addressTypeValidation.error;
    } else {
        validatedData.addressType = addressType.toLowerCase();
    }

    // Validate make default
    const makeDefaultValidation = validateMakeDefault(makeDefault);
    validatedData.isDefault = makeDefaultValidation.parsedValue;

    return {
        isValid: Object.keys(errors).length === 0,
        errors: errors,
        validatedData: validatedData
    };
};



/**
 * Validates all address form fields for updating an existing address
 * @param {object} formData - Object containing form fields
 * @returns {object} - { isValid: boolean, errors: object, validatedData: object }
 */
const validateUpdateAddressForm = (formData) => {
    // For update, validation is the same as add
    return validateAddAddressForm(formData);
};



/**
 * Validates phone number for profile update (optional field)
 * @param {string} phone - The phone number to validate
 * @returns {object} - { isValid: boolean, error: string, field: string }
 */
const validateProfilePhone = (phone) => {
    // Phone is optional for profile
    if (!phone || phone.trim() === '') {
        return {
            isValid: true,
            trimmedValue: null
        };
    }

    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(phone.trim())) {
        return {
            isValid: false,
            error: 'Phone number must be 10 digits and start with 6, 7, 8, or 9',
            field: 'phone'
        };
    }

    return {
        isValid: true,
        trimmedValue: phone.trim()
    };
};



/**
 * Validates email address format
 * @param {string} email - The email to validate
 * @returns {object} - { isValid: boolean, error: string, field: string }
 */
const validateEmailFormat = (email) => {
    if (!email || email.trim() === '') {
        return {
            isValid: false,
            error: 'Email is required',
            field: 'email'
        };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
        return {
            isValid: false,
            error: 'Please enter a valid email address',
            field: 'email'
        };
    }

    return {
        isValid: true,
        trimmedValue: email.toLowerCase().trim()
    };
};



/**
 * Validates address selection for checkout
 * @param {string} selectedAddressId - The selected address ID
 * @returns {object} - { isValid: boolean, error: string, field: string }
 */
const validateAddressSelection = (selectedAddressId) => {
    if (!selectedAddressId || selectedAddressId.trim() === '') {
        return {
            isValid: false,
            error: 'Please select a delivery address',
            field: 'selectedAddressId'
        };
    }

    return {
        isValid: true
    };
};



module.exports = {
    validateAddressFullName,
    validateMobileNumber,
    validateAltPhone,
    validateAddressDetails,
    validateCity,
    validateState,
    validatePincode,
    validateLandmark,
    validateAddressType,
    validateMakeDefault,
    validateAddAddressForm,
    validateUpdateAddressForm,
    validateProfilePhone,
    validateEmailFormat,
    validateAddressSelection
};