const Address = require('../../models/address-schema');
const User = require('../../models/user-schema');
const { 
    validateAddAddressForm, 
    validateUpdateAddressForm 
} = require('../../validator/addressValidator-simple');


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
    
    console.log('Received form data:', req.body);
    
    // Validate form data using the validator
    const validation = validateAddAddressForm(req.body);
    
    console.log('Validation result:', validation);
    
    if (!validation.isValid) {
      console.log('Validation failed:', validation.errors);
      // Return the first validation error
      const firstError = Object.values(validation.errors)[0];
      return res.status(400).json({
        success: false,
        message: firstError
      });
    }

    console.log('Validated data:', validation.validatedData);

    // Find existing address document or create new one
    let addressDoc = await Address.findOne({ userId });

    // If this is set as default, remove default from other addresses
    if (validation.validatedData.isDefault) {
      if (addressDoc) {
        addressDoc.address.forEach(addr => {
          addr.isDefault = false;
        });
      }
    }

    const newAddress = validation.validatedData;

    // If this is the first address, make it default automatically
    if (!addressDoc || addressDoc.address.length === 0) {
      newAddress.isDefault = true;
    }

    console.log('New address to save:', newAddress);

    if (addressDoc) {
      addressDoc.address.push(newAddress);
    } else {
      addressDoc = new Address({
        userId,
        address: [newAddress]
      });
    }

    console.log('Address document before save:', addressDoc);

    await addressDoc.save();

    console.log('Address saved successfully');

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
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Error saving address: ' + error.message
    });
  }
};



// Update existing address
const updateAddress = async (req, res) => {
  try {
    const userId = req.session.userId;
    const addressId = req.params.id;
    
    // Validate form data using the validator
    const validation = validateUpdateAddressForm(req.body);
    
    if (!validation.isValid) {
      // Return the first validation error
      const firstError = Object.values(validation.errors)[0];
      return res.status(400).json({
        success: false,
        message: firstError
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
    if (validation.validatedData.isDefault) {
      addressDoc.address.forEach(addr => {
        if (addr._id.toString() !== addressId) {
          addr.isDefault = false;
        }
      });
    }

    // Update address fields with validated data
    Object.assign(address, validation.validatedData);

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