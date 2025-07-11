const Address = require('../../models/address-schema');
const User = require('../../models/user-schema');


// Load address listing page
const loadAddressList = async (req, res) => {
  try {
    const userId = req.session.userId;
    
    // Get user data for sidebar
    const user = await User.findById(userId).select('fullname email profilePhoto');
    if (!user) {
      return res.redirect('/login');
    }

    // Get user's addresses
    const addressDoc = await Address.findOne({ userId }).populate('userId');
    const addresses = addressDoc ? addressDoc.address : [];

    res.render('address-list', {
      user,
      addresses,
      title: 'Address Book'
    });
  } catch (error) {
    console.error('Error loading address list:', error);
    res.status(500).render('error', { message: 'Error loading addresses' });
  }
};



// Load address form (for add/edit)
const loadAddressForm = async (req, res) => {
  try {
    const userId = req.session.userId;
    const addressId = req.params.id;
    const returnTo = req.query.returnTo;

    // Get user data for sidebar
    const user = await User.findById(userId).select('fullname email profilePhoto');
    if (!user) {
      return res.redirect('/login');
    }

    let address = null;
    let isEdit = false;

    // If editing, get the specific address
    if (addressId) {
      const addressDoc = await Address.findOne({ userId });
      if (addressDoc) {
        address = addressDoc.address.id(addressId);
        isEdit = true;
      }
    }

    res.render('address', {
      user,
      address,
      isEdit,
      returnTo,
      title: isEdit ? 'Edit Address' : 'Add New Address'
    });
  } catch (error) {
    console.error('Error loading address form:', error);
    res.status(500).render('error', { message: 'Error loading address form' });
  }
};



// Save new address
const saveAddress = async (req, res) => {
  try {
    const userId = req.session.userId;
    const {
      fullName,
      mobileNumber,
      addressDetails,
      district,
      city,
      state,
      pincode,
      landmark,
      addressType,
      altPhone,
      makeDefault
    } = req.body;

    // Validate required fields
    if (!fullName || !mobileNumber || !addressDetails || !district || !city || !state || !pincode || !addressType) {
      return res.status(400).json({
        success: false,
        message: 'Please fill in all required fields'
      });
    }

    // Validate full name (same as signup form)
    const trimmedFullName = fullName.trim();
    if (trimmedFullName.length < 4) {
      return res.status(400).json({
        success: false,
        message: 'Full name must be at least 4 characters long'
      });
    }
    if (!/^[a-zA-Z\s]+$/.test(trimmedFullName)) {
      return res.status(400).json({
        success: false,
        message: 'Full name can only contain alphabets and spaces'
      });
    }

    // Validate mobile number (same as signup form)
    const mobileRegex = /^[6-9]\d{9}$/;
    if (!mobileRegex.test(mobileNumber.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number must be 10 digits and start with 6, 7, 8, or 9'
      });
    }

    // Validate alternative phone if provided
    if (altPhone && altPhone.trim()) {
      if (!mobileRegex.test(altPhone.trim())) {
        return res.status(400).json({
          success: false,
          message: 'Alternative phone must be 10 digits and start with 6, 7, 8, or 9'
        });
      }
    }

    // Validate address details
    if (addressDetails.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Address details must be at least 10 characters long'
      });
    }

    // Validate city
    const trimmedCity = city.trim();
    if (trimmedCity.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'City must be at least 2 characters long'
      });
    }
    if (!/^[a-zA-Z\s]+$/.test(trimmedCity)) {
      return res.status(400).json({
        success: false,
        message: 'City can only contain alphabets and spaces'
      });
    }

    // Validate pincode (6 digits, cannot start with 0)
    const pincodeRegex = /^[1-9]\d{5}$/;
    if (!pincodeRegex.test(pincode.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Pincode must be exactly 6 digits and cannot start with 0'
      });
    }

    // Find existing address document or create new one
    let addressDoc = await Address.findOne({ userId });

    // If this is set as default, remove default from other addresses
    if (makeDefault === 'true' || makeDefault === true) {
      if (addressDoc) {
        addressDoc.address.forEach(addr => {
          addr.isDefault = false;
        });
      }
    }

    const newAddress = {
      addressType,
      name: trimmedFullName,
      city: trimmedCity,
      landMark: addressDetails.trim(),
      state,
      pincode: parseInt(pincode.trim()),
      phone: mobileNumber.trim(),
      altPhone: altPhone && altPhone.trim() ? altPhone.trim() : null,
      isDefault: makeDefault === 'true' || makeDefault === true || false
    };

    // If this is the first address, make it default automatically
    if (!addressDoc || addressDoc.address.length === 0) {
      newAddress.isDefault = true;
    }

    if (addressDoc) {
      addressDoc.address.push(newAddress);
    } else {
      addressDoc = new Address({
        userId,
        address: [newAddress]
      });
    }

    await addressDoc.save();

    // Check if this is a redirect from checkout
    const returnTo = req.query.returnTo;
    if (returnTo === 'checkout') {
      // Store success message in session for toast notification
      req.session.addressSuccess = 'Address added successfully';
      return res.redirect('/checkout');
    }

    res.json({
      success: true,
      message: 'Address saved successfully'
    });

  } catch (error) {
    console.error('Error saving address:', error);
    res.status(500).json({
      success: false,
      message: 'Error saving address'
    });
  }
};



// Update existing address
const updateAddress = async (req, res) => {
  try {
    const userId = req.session.userId;
    const addressId = req.params.id;
    const {
      fullName,
      mobileNumber,
      addressDetails,
      district,
      city,
      state,
      pincode,
      landmark,
      addressType,
      altPhone,
      makeDefault
    } = req.body;

    // Validate required fields
    if (!fullName || !mobileNumber || !addressDetails || !district || !city || !state || !pincode || !addressType) {
      return res.status(400).json({
        success: false,
        message: 'Please fill in all required fields'
      });
    }

    // Validate full name (same as signup form)
    const trimmedFullName = fullName.trim();
    if (trimmedFullName.length < 4) {
      return res.status(400).json({
        success: false,
        message: 'Full name must be at least 4 characters long'
      });
    }
    if (!/^[a-zA-Z\s]+$/.test(trimmedFullName)) {
      return res.status(400).json({
        success: false,
        message: 'Full name can only contain alphabets and spaces'
      });
    }

    // Validate mobile number (same as signup form)
    const mobileRegex = /^[6-9]\d{9}$/;
    if (!mobileRegex.test(mobileNumber.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number must be 10 digits and start with 6, 7, 8, or 9'
      });
    }

    // Validate alternative phone if provided
    if (altPhone && altPhone.trim()) {
      if (!mobileRegex.test(altPhone.trim())) {
        return res.status(400).json({
          success: false,
          message: 'Alternative phone must be 10 digits and start with 6, 7, 8, or 9'
        });
      }
    }

    // Validate address details
    if (addressDetails.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Address details must be at least 10 characters long'
      });
    }

    // Validate city
    const trimmedCity = city.trim();
    if (trimmedCity.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'City must be at least 2 characters long'
      });
    }
    if (!/^[a-zA-Z\s]+$/.test(trimmedCity)) {
      return res.status(400).json({
        success: false,
        message: 'City can only contain alphabets and spaces'
      });
    }

    // Validate pincode (6 digits, cannot start with 0)
    const pincodeRegex = /^[1-9]\d{5}$/;
    if (!pincodeRegex.test(pincode.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Pincode must be exactly 6 digits and cannot start with 0'
      });
    }

    const addressDoc = await Address.findOne({ userId });
    if (!addressDoc) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    const address = addressDoc.address.id(addressId);
    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    // If this is set as default, remove default from other addresses
    if (makeDefault === 'true' || makeDefault === true) {
      addressDoc.address.forEach(addr => {
        if (addr._id.toString() !== addressId) {
          addr.isDefault = false;
        }
      });
    }

    // Update address fields
    address.addressType = addressType;
    address.name = trimmedFullName;
    address.city = trimmedCity;
    address.landMark = addressDetails.trim();
    address.state = state;
    address.pincode = parseInt(pincode.trim());
    address.phone = mobileNumber.trim();
    address.altPhone = altPhone && altPhone.trim() ? altPhone.trim() : null;
    address.isDefault = makeDefault === 'true' || makeDefault === true || false;

    await addressDoc.save();

    // Check if this is a redirect from checkout
    const returnTo = req.query.returnTo;
    if (returnTo === 'checkout') {
      // Store success message in session for toast notification
      req.session.addressSuccess = 'Address updated successfully';
      return res.redirect('/checkout');
    }

    res.json({
      success: true,
      message: 'Address updated successfully'
    });

  } catch (error) {
    console.error('Error updating address:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating address'
    });
  }
};



// Delete address
const deleteAddress = async (req, res) => {
  try {
    const userId = req.session.userId;
    const addressId = req.params.id;

    const addressDoc = await Address.findOne({ userId });
    if (!addressDoc) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    // Find the address to be deleted
    const addressToDelete = addressDoc.address.id(addressId);
    if (!addressToDelete) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    const wasDefault = addressToDelete.isDefault;

    // Remove the address from the array
    addressDoc.address.pull(addressId);

    // If the deleted address was default and there are other addresses, make the first one default
    if (wasDefault && addressDoc.address.length > 0) {
      addressDoc.address[0].isDefault = true;
    }

    await addressDoc.save();

    res.json({
      success: true,
      message: 'Address deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting address:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting address'
    });
  }
};



// Set address as default
const setAsDefault = async (req, res) => {
  try {
    const userId = req.session.userId;
    const addressId = req.params.id;

    const addressDoc = await Address.findOne({ userId });
    if (!addressDoc) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    const address = addressDoc.address.id(addressId);
    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    // Remove default from all addresses
    addressDoc.address.forEach(addr => {
      addr.isDefault = false;
    });

    // Set this address as default
    address.isDefault = true;

    await addressDoc.save();

    res.json({
      success: true,
      message: 'Address set as default successfully'
    });

  } catch (error) {
    console.error('Error setting default address:', error);
    res.status(500).json({
      success: false,
      message: 'Error setting default address'
    });
  }
};



module.exports = {
  loadAddressList,
  loadAddressForm,
  saveAddress,
  updateAddress,
  deleteAddress,
  setAsDefault
};