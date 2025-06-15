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
      altPhone
    } = req.body;

    // Validate required fields
    if (!fullName || !mobileNumber || !addressDetails || !city || !state || !pincode || !addressType) {
      return res.status(400).json({
        success: false,
        message: 'Please fill in all required fields'
      });
    }

    // Validate mobile number
    const mobileRegex = /^[6-9]\d{9}$/;
    if (!mobileRegex.test(mobileNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 10-digit mobile number'
      });
    }

    // Validate pincode
    const pincodeRegex = /^\d{6}$/;
    if (!pincodeRegex.test(pincode)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 6-digit pincode'
      });
    }

    const newAddress = {
      addressType,
      name: fullName,
      city,
      landMark: landmark || district,
      state,
      pincode: parseInt(pincode),
      phone: mobileNumber,
      altPhone: altPhone || null
    };

    // Find existing address document or create new one
    let addressDoc = await Address.findOne({ userId });
    
    if (addressDoc) {
      addressDoc.address.push(newAddress);
    } else {
      addressDoc = new Address({
        userId,
        address: [newAddress]
      });
    }

    await addressDoc.save();

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
      altPhone
    } = req.body;

    // Validate required fields
    if (!fullName || !mobileNumber || !addressDetails || !city || !state || !pincode || !addressType) {
      return res.status(400).json({
        success: false,
        message: 'Please fill in all required fields'
      });
    }

    // Validate mobile number
    const mobileRegex = /^[6-9]\d{9}$/;
    if (!mobileRegex.test(mobileNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 10-digit mobile number'
      });
    }

    // Validate pincode
    const pincodeRegex = /^\d{6}$/;
    if (!pincodeRegex.test(pincode)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 6-digit pincode'
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

    // Update address fields
    address.addressType = addressType;
    address.name = fullName;
    address.city = city;
    address.landMark = landmark || district;
    address.state = state;
    address.pincode = parseInt(pincode);
    address.phone = mobileNumber;
    address.altPhone = altPhone || null;

    await addressDoc.save();

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

    // Remove the address from the array
    addressDoc.address.pull(addressId);
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

module.exports = {
  loadAddressList,
  loadAddressForm,
  saveAddress,
  updateAddress,
  deleteAddress
};
