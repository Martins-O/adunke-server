const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const { auth } = require('../middleware/auth');
const cloudinary = require('../config/cloudinary');
const upload = require('../middleware/multer');
const fs = require('fs').promises;

console.log('Auth middleware:', auth);
console.log('Cloudinary:', cloudinary);
console.log('Multer:', upload);

// Get all active products (for customers)
router.get('/', async (req, res) => {
    try {
        const { category, search, minPrice, maxPrice, inStock, tags, isFeatured, sort = 'newest', limit = 50, page = 1 } = req.query;
        const parsedLimit = parseInt(limit, 10);
        const parsedPage = parseInt(page, 10);
        if (isNaN(parsedLimit) || parsedLimit <= 0) throw new Error('Invalid limit');
        if (isNaN(parsedPage) || parsedPage <= 0) throw new Error('Invalid page');

        const query = { isActive: true };
        if (category) query.category = category;
        if (minPrice || maxPrice) {
            query.price = {};
            if (minPrice) query.price.$gte = parseFloat(minPrice);
            if (maxPrice) query.price.$lte = parseFloat(maxPrice);
        }
        if (inStock === 'true') query.stock = { $gt: 0 };
        if (tags) query.tags = { $all: tags.split(',') };
        if (isFeatured === 'true') query.isFeatured = true;
        if (search) query.$text = { $search: search };

        let sortQuery = {};
        switch (sort) {
            case 'priceLowToHigh': sortQuery.price = 1; break;
            case 'priceHighToLow': sortQuery.price = -1; break;
            case 'rating': sortQuery['ratings.average'] = -1; break;
            case 'newest': default: sortQuery.createdAt = -1; break;
        }

        const skip = (parsedPage - 1) * parsedLimit;
        const [products, total] = await Promise.all([
            Product.find(query).sort(sortQuery).skip(skip).limit(parsedLimit).select('-reviews'),
            Product.countDocuments(query),
        ]);

        res.json({
            success: true,
            products,
            pagination: { currentPage: parsedPage, totalPages: Math.ceil(total / parsedLimit), totalItems: total, itemsPerPage: parsedLimit },
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ success: false, message: 'Error fetching products', error: error.message });
    }
});

// Get product categories
router.get('/categories', async (req, res) => {
    try {
        const categories = Product.getCategories()
        res.json(categories);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ message: 'Error fetching categories', statusCode: 500, error: error.message });
    }
});

// Get a single product (with reviews)
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!/^[0-9a-fA-F]{24}$/.test(id)) return res.status(400).json({ message: 'Invalid product ID format' });

        const product = await Product.findOne({ _id: id, isActive: true }).populate('reviews.user', 'username');
        if (!product) return res.status(404).json({ message: 'Product not found or inactive' });

        res.json(product);
    } catch (error) {
        console.error('Error fetching product:', error);
        res.status(500).json({ message: 'Error fetching product', error: error.message });
    }
});

// Admin: Add a product with multiple images
const uploadFields = upload.fields([{ name: 'images', maxCount: 5 }]);
router.post('/admin/add', auth, uploadFields, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });

        console.log('req.files:', req.files);
        console.log('req.body:', req.body);

        if (!req.files || !req.files['images'] || req.files['images'].length === 0) {
            return res.status(400).json({ message: 'At least one product image is required' });
        }

        const files = req.files['images']; // Access 'images' field
        const { name, price, discountPercent, description, stock, category, sizes, colors, tags, isFeatured } = req.body;


        const imageUrls = await Promise.all(
            files.map(file => cloudinary.uploader.upload(file.path, { folder: 'clothing-store/products', transformation: [{ width: 800, height: 800, crop: 'limit' }] }).then(result => result.secure_url))
        );
        await Promise.all(files.map(file => fs.unlink(file.path)));


        const product = new Product({
            name,
            price,
            discountPercent: discountPercent || 0,
            description,
            images: imageUrls,
            stock,
            category,
            sizes: sizes ? sizes.split(',') : [],
            colors: colors ? colors.split(',') : [],
            tags: tags ? tags.split(',') : [],
            isFeatured: isFeatured === 'true',
        });

        const savedProduct = await product.save();
        res.status(201).json({ message: 'Product created successfully', product: savedProduct });
    } catch (error) {
        console.error('Error adding product:', error);
        if (req.files && req.files['images']) await Promise.all(req.files['images'].map(file => fs.unlink(file.path).catch(() => {})));
        res.status(400).json({ message: 'Error adding product', error: error.message });
    }
});

// Admin: Bulk add products
router.post('/admin/bulk', auth, upload.array('images', 50), async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });

        const productsData = JSON.parse(req.body.products);
        const files = req.files;

        if (!productsData || !Array.isArray(productsData) || productsData.length === 0) {
            return res.status(400).json({ message: 'Products array is required' });
        }

        const imageCount = productsData.reduce((acc, p) => acc + (p.imageCount || 1), 0);
        if (files.length !== imageCount) return res.status(400).json({ message: 'Number of images must match total product images' });

        let fileIndex = 0;
        const uploadedProducts = await Promise.all(
            productsData.map(async (productData) => {
                const { name, price, discountPercent, description, stock, category, sizes, colors, tags, isFeatured, imageCount = 1 } = productData;
                const productImages = files.slice(fileIndex, fileIndex + imageCount);
                fileIndex += imageCount;

                const imageUrls = await Promise.all(
                    productImages.map(file => cloudinary.uploader.upload(file.path, { folder: 'clothing-store/products', transformation: [{ width: 800, height: 800, crop: 'limit' }] }).then(result => result.secure_url))
                );

                const product = new Product({
                    name,
                    price,
                    discountPercent: discountPercent || 0,
                    description,
                    images: imageUrls,
                    stock,
                    category,
                    sizes: sizes ? sizes.split(',') : [],
                    colors: colors ? colors.split(',') : [],
                    tags: tags ? tags.split(',') : [],
                    isFeatured: isFeatured === 'true',
                });

                return product.save();
            })
        );

        await Promise.all(files.map(file => fs.unlink(file.path)));
        res.status(201).json({ message: 'Products added successfully', count: uploadedProducts.length, products: uploadedProducts });
    } catch (error) {
        console.error('Error adding bulk products:', error);
        if (req.files) await Promise.all(req.files.map(file => fs.unlink(file.path).catch(() => {})));
        res.status(400).json({ message: 'Error adding bulk products', error: error.message });
    }
});

// Admin: Update a product
router.patch('/admin/update/:id', auth, upload.array('images', 5), async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });

        const { sizes, colors, tags, discountPercent, ...updates } = req.body;
        const files = req.files;

        if (files && files.length > 0) {
            const imageUrls = await Promise.all(
                files.map(file => cloudinary.uploader.upload(file.path, { folder: 'clothing-store/products', transformation: [{ width: 800, height: 800, crop: 'limit' }] }).then(result => result.secure_url))
            );
            updates.images = imageUrls;
            await Promise.all(files.map(file => fs.unlink(file.path)));
        }

        if (sizes) updates.sizes = sizes.split(',');
        if (colors) updates.colors = colors.split(',');
        if (tags) updates.tags = tags.split(',');
        if (discountPercent !== undefined) updates.discountPercent = discountPercent;

        const product = await Product.findByIdAndUpdate(
            req.params.id,
            { ...updates, updatedAt: Date.now() },
            { new: true, runValidators: true, context: 'query' }
        );

        if (!product) return res.status(404).json({ message: 'Product not found' });
        res.json({ message: 'Product updated successfully', product });
    } catch (error) {
        console.error('Error updating product:', error);
        if (req.files) await Promise.all(req.files.map(file => fs.unlink(file.path).catch(() => {})));
        res.status(400).json({ message: 'Error updating product', error: error.message });
    }
});

// User: Add a review
router.post('/:id/reviews', auth, async (req, res) => {
    try {
        const { rating, comment } = req.body;
        const product = await Product.findById(req.params.id);

        if (!product || !product.isActive) {
            return res.status(404).json({ message: 'Product not found or inactive' });
        }

        const review = {
            user: req.user.id,
            rating,
            comment,
        };

        product.reviews.push(review);

        // Update ratings
        const totalRatings = product.reviews.length;
        const avgRating = product.reviews.reduce((sum, r) => sum + r.rating, 0) / totalRatings;
        product.ratings = { average: avgRating, count: totalRatings };

        await product.save();

        res.status(201).json({
            message: 'Review added successfully',
            review,
        });
    } catch (error) {
        console.error('Error adding review:', error);
        res.status(400).json({
            message: 'Error adding review',
            error: error.message,
        });
    }
});

// Admin: Soft delete a product
router.delete('/admin/delete/:id', auth, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Admin access required' });
        }

        const product = await Product.findByIdAndUpdate(
            req.params.id,
            { isActive: false },
            { new: true }
        );

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        res.json({
            message: 'Product deactivated successfully',
            product,
        });
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({
            message: 'Error deleting product',
            error: error.message,
        });
    }
});

// Admin: Permanent delete
router.delete('/admin/permanent/:id', auth, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Admin access required' });
        }

        const product = await Product.findByIdAndDelete(req.params.id);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        res.json({ message: 'Product permanently deleted' });
    } catch (error) {
        console.error('Error permanently deleting product:', error);
        res.status(500).json({
            message: 'Error deleting product',
            error: error.message,
        });
    }
});

module.exports = router;