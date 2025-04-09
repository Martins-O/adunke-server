const mongoose = require('mongoose');

const categoryEnum = [
    'CLOTHING',
    'SHOES',
    'ACCESSORIES',
    'NIGHT WEARS',
    'BEAUTY',
    'SPORT WEARS',
    'TOYS',
    'JEWELRY',
    'OTHER'
];

const reviewSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    rating: {
        type: Number,
        required: true,
        min: [1, 'Rating must be at least 1'],
        max: [5, 'Rating cannot exceed 5'],
    },
    comment: {
        type: String,
        trim: true,
        maxlength: [500, 'Review comment cannot exceed 500 characters'],
    },
}, { timestamps: true });

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Product name is required'],
        trim: true,
        minlength: [2, 'Product name must be at least 2 characters long'],
        maxlength: [100, 'Product name cannot exceed 100 characters'],
        index: true,
    },
    price: {
        type: Number,
        required: [true, 'Price is required'],
        min: [0, 'Price cannot be negative'],
    },
    discountPrice: {
        type: Number,
        min: [0, 'Discount price cannot be negative'],
        validate: {
            validator: function (value) {
                return value === undefined || value < this.price;
            },
            message: 'Discount price must be less than regular price',
        },
    },
    description: {
        type: String,
        trim: true,
        maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    images: [{
        type: String,
        required: [true, 'At least one image URL is required'],
        match: [/^https?:\/\/.+\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i, 'Please provide a valid image URL'],
    }],
    stock: {
        type: Number,
        default: 0,
        min: [0, 'Stock cannot be negative'],
    },
    sizes: [{
        type: String,
        enum: {
            values: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Custom'],
            message: '{VALUE} is not a valid size',
        },
    }],
    colors: [{
        type: String,
        trim: true,
        maxlength: [50, 'Color name cannot exceed 50 characters'],
    }],
    category: {
        type: String,
        trim: true,
        required: [true, 'Category is required'],
        enum: {
            values: categoryEnum,
            message: '{VALUE} is not a valid category',
        },
        default: 'OTHER',
    },
    tags: [{
        type: String,
        trim: true,
        maxlength: [50, 'Tag cannot exceed 50 characters'],
        index: true,
    }],
    isActive: {
        type: Boolean,
        default: true,
        index: true,
    },
    isFeatured: {
        type: Boolean,
        default: false,
        index: true,
    },
    ratings: {
        average: { type: Number, default: 0, min: 0, max: 5 },
        count: { type: Number, default: 0, min: 0 },
    },
    reviews: [reviewSchema],
}, {
    timestamps: true,
    toJSON: {
        transform: (doc, ret) => {
            delete ret.__v;
            return ret;
        },
    },
});

productSchema.statics.getCategories = function() {
    return categoryEnum;
};

// Compound indexes for efficient querying
productSchema.index({ name: 'text', description: 'text', tags: 'text' });
productSchema.index({ category: 1, isActive: 1, isFeatured: 1 });

const Product = mongoose.model('Product', productSchema);

module.exports = Product;