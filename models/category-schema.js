const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  isListed: {
    type: Boolean,
    default: true
  },
},{timestamps: true});


categorySchema.pre('save', async function(next) {
    if (this.isModified('name')) {
        const existingCategory = await this.constructor.findOne({ name: new RegExp(`^${this.name}$`, 'i') });
        if (existingCategory && existingCategory._id.toString() !== this._id.toString()) {
            const err = new Error('A category with this name already exists.');
            err.statusCode = 409; // Conflict
            return next(err);
        }
    }
    next();
});


const Category = mongoose.model('Category', categorySchema);

module.exports = Category;
