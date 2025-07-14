

/**
 * Validates fullname field
 * @param {string} fullname - The fullname to validate
 * @returns {object} - { isValid: boolean, error: string, field: string }
 */
const validateFullname = (fullname) => {
  // Check if fullname is provided
  if (!fullname) {
    return {
      isValid: false,
      error: "Full name is required",
      field: "fullname"
    };
  }

  // Check if fullname starts with whitespace
  if (fullname.startsWith(' ')) {
    return {
      isValid: false,
      error: "Full name cannot start with whitespace",
      field: "fullname"
    };
  }

  const trimmedFullname = fullname.trim();
  
  // Check minimum length
  if (trimmedFullname.length < 4) {
    return {
      isValid: false,
      error: "Full name must be at least 4 characters",
      field: "fullname"
    };
  }

  // Check if contains only alphabets and whitespaces (no numbers or special characters)
  if (!/^[a-zA-Z\s]+$/.test(trimmedFullname)) {
    return {
      isValid: false,
      error: "Full name can only contain alphabets and spaces",
      field: "fullname"
    };
  }

  return {
    isValid: true,
    trimmedValue: trimmedFullname
  };
};



/**
 * Validates email field
 * @param {string} email - The email to validate
 * @returns {object} - { isValid: boolean, error: string, field: string }
 */
const validateEmail = (email) => {
  // Check if email is provided
  if (!email) {
    return {
      isValid: false,
      error: "Email is required",
      field: "email"
    };
  }

  const trimmedEmail = email.trim();

  // Check if email contains whitespace
  if (/\s/.test(trimmedEmail)) {
    return {
      isValid: false,
      error: "Email cannot contain whitespaces",
      field: "email"
    };
  }

  // Check if email contains only lowercase letters (no uppercase allowed)
  if (/[A-Z]/.test(trimmedEmail)) {
    return {
      isValid: false,
      error: "Email must contain only lowercase letters",
      field: "email"
    };
  }

  // Check basic email structure
  if (!trimmedEmail.includes('@') || trimmedEmail.split('@').length !== 2) {
    return {
      isValid: false,
      error: "Email must contain @ symbol",
      field: "email"
    };
  }

  const [localPart, domainPart] = trimmedEmail.split('@');

  // Validate local part (before @): only lowercase alphabets and numbers
  if (!localPart || !/^[a-z0-9]+$/.test(localPart)) {
    return {
      isValid: false,
      error: "Before @ symbol: only lowercase letters and numbers allowed",
      field: "email"
    };
  }

  // Validate domain part (after @): only lowercase alphabets and dots
  if (!domainPart || !/^[a-z.]+$/.test(domainPart)) {
    return {
      isValid: false,
      error: "After @ symbol: only lowercase letters and dots allowed",
      field: "email"
    };
  }

  // Check if domain has at least one dot and proper structure
  if (!domainPart.includes('.') || domainPart.startsWith('.') || domainPart.endsWith('.')) {
    return {
      isValid: false,
      error: "Domain must contain at least one dot",
      field: "email"
    };
  }

  // Check if domain parts are valid (only lowercase alphabets between dots)
  const domainParts = domainPart.split('.');
  for (const part of domainParts) {
    if (!/^[a-z]+$/.test(part)) {
      return {
        isValid: false,
        error: "Please enter a valid email address with lowercase letters only",
        field: "email"
      };
    }
  }

  return {
    isValid: true,
    trimmedValue: trimmedEmail
  };
};



/**
 * Validates password field
 * @param {string} password - The password to validate
 * @returns {object} - { isValid: boolean, error: string, field: string }
 */
const validatePassword = (password) => {
  // Check if password is provided
  if (!password || password.length < 8) {
    return {
      isValid: false,
      error: "Password must be at least 8 characters",
      field: "password"
    };
  }

  // Enhanced password validation
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  if (!passwordRegex.test(password)) {
    return {
      isValid: false,
      error: "Password must be at least 8 characters with uppercase, lowercase, number and special character",
      field: "password"
    };
  }

  return {
    isValid: true
  };
};



/**
 * Validates phone field
 * @param {string} phone - The phone to validate
 * @returns {object} - { isValid: boolean, error: string, field: string }
 */
const validatePhone = (phone) => {
  // Phone is optional, so if not provided, it's valid
  if (!phone) {
    return {
      isValid: true
    };
  }

  const trimmedPhone = phone.trim();
  
  // Check phone format
  if (!/^[6-9]\d{9}$/.test(trimmedPhone)) {
    return {
      isValid: false,
      error: "Phone number must be 10 digits and start with 6, 7, 8, or 9",
      field: "phone"
    };
  }

  return {
    isValid: true,
    trimmedValue: trimmedPhone
  };
};



/**
 * Validates all signup form fields
 * @param {object} formData - Object containing form fields
 * @returns {object} - { isValid: boolean, errors: array, validatedData: object }
 */
const validateSignupForm = (formData) => {
  const { fullname, email, password, phone } = formData;
  const errors = [];
  const validatedData = {};

  // Validate fullname
  const fullnameValidation = validateFullname(fullname);
  if (!fullnameValidation.isValid) {
    errors.push({
      message: fullnameValidation.error,
      field: fullnameValidation.field
    });
  } else {
    validatedData.fullname = fullnameValidation.trimmedValue;
  }

  // Validate email
  const emailValidation = validateEmail(email);
  if (!emailValidation.isValid) {
    errors.push({
      message: emailValidation.error,
      field: emailValidation.field
    });
  } else {
    validatedData.email = emailValidation.trimmedValue;
  }

  // Validate password
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.isValid) {
    errors.push({
      message: passwordValidation.error,
      field: passwordValidation.field
    });
  } else {
    validatedData.password = password;
  }

  // Validate phone
  const phoneValidation = validatePhone(phone);
  if (!phoneValidation.isValid) {
    errors.push({
      message: phoneValidation.error,
      field: phoneValidation.field
    });
  } else {
    validatedData.phone = phoneValidation.trimmedValue || phone;
  }

  return {
    isValid: errors.length === 0,
    errors: errors,
    validatedData: validatedData
  };
};


module.exports = {
  validateFullname,
  validateEmail,
  validatePassword,
  validatePhone,
  validateSignupForm
};