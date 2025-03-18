const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Product name is required'],
        trim: true,
        minlength: [2, 'Product name must be at least 2 characters long'],
        maxlength: [100, 'Product name cannot exceed 100 characters'],
        index: true, // For faster searching
    },
    price: {
        type: Number,
        required: [true, 'Price is required'],
        min: [0, 'Price cannot be negative'],
    },
    description: {
        type: String,
        trim: true,
        maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    image: [{
        type: String,
        required: [true, 'Image URL is required'],
        match: [/^https?:\/\/.+\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i, 'Please provide a valid image URL (jpg, jpeg, png, webp, or gif)'],
    }],
    stock: {
        type: Number,
        default: 0,
        min: [0, 'Stock cannot be negative'],
    },
    category: {
        type: String,
        trim: true,
        enum: {
            values: ['clothing', 'accessories', 'shoes', 'other'],
            message: '{VALUE} is not a valid category',
        },
        default: 'clothing',
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true,
    },
}, {
    timestamps: true, // Automatically manages createdAt and updatedAt
    toJSON: {
        transform: (doc, ret) => {
            delete ret.id;
            delete ret.__v;
            return ret;
        },
    },
});

// Text index for efficient searching
productSchema.index({ name: 'text', description: 'text' });

const Product = mongoose.model('Product', productSchema);

module.exports = Product;