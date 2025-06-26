const Category = require('../../models/category-schema');
const mongoose = require('mongoose');

// Render the category management page
const renderCategoryManagementPage = async (req, res) => {
    try {
        // Pass an empty array for categories initially, JS will fetch them
        res.render('get-category', { 
        });
    } catch (error) {
        console.error("Error rendering category page:", error);
        res.status(500).send("Error loading the page.");
    }
};


// API: Get all categories (excluding soft deleted)
const getAllCategoriesAPI = async (req, res) => {
    try {
        // Use $ne: true to handle both false and undefined/null values (for existing categories)
        const categories = await Category.find({
            $or: [
                { isDeleted: false },
                { isDeleted: { $exists: false } }
            ]
        }).sort({ createdAt: -1 }); // Sort by newest, exclude deleted
        // Map to match frontend expected structure if needed, especially for 'date'
        const formattedCategories = categories.map(cat => ({
            _id: cat._id,
            name: cat.name,
            description: cat.description,
            isListed: cat.isListed, // Use isListed, not status
            date: cat.createdAt.toISOString().split('T')[0] // Format date
        }));
        res.status(200).json(formattedCategories);
    } catch (error) {
        console.error("Error fetching categories:", error);
        res.status(500).json({ message: 'Error fetching categories', error: error.message });
    }
};


// API: Add a new category
const addCategoryAPI = async (req, res) => {
    try {
        const { name, description, status } = req.body;

        if (!name) {
            return res.status(400).json({ message: 'Category name is required.' });
        }

        const newCategory = new Category({
            name,
            description,
            status: status !== undefined ? status : true // Default to true if not provided
        });

        await newCategory.save();
        // Return the newly created category with formatted date
        res.status(201).json({
            _id: newCategory._id,
            name: newCategory.name,
            description: newCategory.description,
            status: newCategory.status,
            date: newCategory.createdAt.toISOString().split('T')[0]
        });
    } catch (error) {
        console.error("Error adding category:", error);
        if (error.code === 11000 || error.message.includes('A category with this name already exists')) { // MongoDB duplicate key error or custom pre-save error
            return res.status(409).json({ message: 'A category with this name already exists.' });
        }
        res.status(500).json({ message: 'Error adding category', error: error.message });
    }
};


// API: Update an existing category
const updateCategoryAPI = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, status } = req.body; // Include status if you want to update it here too

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid category ID.' });
        }

        if (!name) {
            return res.status(400).json({ message: 'Category name is required.' });
        }
        
        // Check for name uniqueness if name is being changed (only among non-deleted categories)
        if (name) {
            const existingCategory = await Category.findOne({
                name: new RegExp(`^${name}$`, 'i'),
                _id: { $ne: id },
                $or: [
                    { isDeleted: false },
                    { isDeleted: { $exists: false } }
                ]
            });
            if (existingCategory) {
                return res.status(409).json({ message: 'Another category with this name already exists.' });
            }
        }

        const updateData = { name, description };
        if (status !== undefined) { // Only update status if provided
            updateData.status = status;
        }

        const updatedCategory = await Category.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });

        if (!updatedCategory) {
            return res.status(404).json({ message: 'Category not found.' });
        }
        res.status(200).json({
            _id: updatedCategory._id,
            name: updatedCategory.name,
            description: updatedCategory.description,
            status: updatedCategory.status,
            date: updatedCategory.createdAt.toISOString().split('T')[0] // or updatedAt
        });
    } catch (error) {
        console.error("Error updating category:", error);
         if (error.code === 11000) {
            return res.status(409).json({ message: 'A category with this name already exists.' });
        }
        res.status(500).json({ message: 'Error updating category', error: error.message });
    }
};


// API: Toggle category status
const toggleCategoryStatusAPI = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // Expecting { status: true/false }
                    if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid category ID.' });
        }
        if (typeof status !== 'boolean') {
            return res.status(400).json({ message: 'Invalid status value. Must be true or false.' });
        }

        const category = await Category.findById(id);
        if (!category) {
            return res.status(404).json({ message: 'Category not found.' });
        }

        
        category.isListed = status;
        await category.save();

        res.status(200).json({
             message: `Category "${category.name}" status updated.`,
             category: { // Send back the updated category partial data
                _id: category._id,
                status: category.status
             }
        });
    } catch (error) {
        console.error("Error toggling category status:", error);
        res.status(500).json({ message: 'Error toggling category status', error: error.message });
    }
};


// API: Soft delete a category
const deleteCategoryAPI = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid category ID.' });
        }

        const category = await Category.findById(id);
        if (!category) {
            return res.status(404).json({ message: 'Category not found.' });
        }

        if (category.isDeleted) {
            return res.status(400).json({ message: 'Category is already deleted.' });
        }

        // Soft delete the category
        category.isDeleted = true;
        category.isListed = false; // Also unlist when deleting
        await category.save();

        res.status(200).json({
            message: `Category "${category.name}" has been deleted successfully.`,
            category: {
                _id: category._id,
                name: category.name,
                isDeleted: category.isDeleted
            }
        });
    } catch (error) {
        console.error("Error deleting category:", error);
        res.status(500).json({ message: 'Error deleting category', error: error.message });
    }
};




module.exports = {
    renderCategoryManagementPage,
    getAllCategoriesAPI,
    addCategoryAPI,
    updateCategoryAPI,
    toggleCategoryStatusAPI,
    deleteCategoryAPI
};