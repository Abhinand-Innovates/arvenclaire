const mongoose = require('mongoose');
const { Schema } = mongoose;

const categorySchema = new Schema({
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
  }
}, { timestamps: true });

categorySchema.pre('save', async function(next) {
  if (this.isModified('name')) {
    const exists = await this.constructor.findOne({ name: new RegExp(`^${this.name}$`, 'i') });
    if (exists && exists._id.toString() !== this._id.toString()) {
      const err = new Error('A category with this name already exists.');
      err.statusCode = 409;
      return next(err);
    }
  }
  next();
});

const category = mongoose.model('Category', categorySchema);

module.exports = category;
