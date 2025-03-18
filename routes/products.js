const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const { auth } = require('../middleware/auth');
const cloudinary = require('../config/cloudinary');
const upload = require('../middleware/multer');
const fs = require('fs').promises;
console.log('Auth middleware:', auth);// Destructure 'auth'
console.log("Cloudinary ", cloudinary);

// Get all active products (for customers)
router.get('/', async (req, res) => {
    try {
        const {
            category,
            search,
            minPrice,
            maxPrice,
            inStock,
            sort = 'newest',
            limit = 50,
            page = 1,
        } = req.query;

        // Validate query parameters
        const parsedLimit = parseInt(limit, 10);
        const parsedPage = parseInt(page, 10);
        if (isNaN(parsedLimit)) throw new Error('Invalid limit');
        if (isNaN(parsedPage)) throw new Error('Invalid page');

        // Build the query
        const query = { isActive: true };

        // Category filter
        if (category) query.category = category;

        // Price range filter
        if (minPrice || maxPrice) {
            query.price = {};
            if (minPrice) query.price.$gte = parseFloat(minPrice);
            if (maxPrice) query.price.$lte = parseFloat(maxPrice);
        }

        // Stock availability filter
        if (inStock === 'true') query.stock = { $gt: 0 };

        // Search functionality
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
            ];
        }

        // Sorting
        let sortQuery = {};
        switch (sort) {
            case 'priceLowToHigh':
                sortQuery.price = 1;
                break;
            case 'priceHighToLow':
                sortQuery.price = -1;
                break;
            case 'newest':
            default:
                sortQuery.createdAt = -1;
                break;
        }

        // Pagination
        const skip = (parsedPage - 1) * parsedLimit;

        // Fetch products and total count
        const [products, total] = await Promise.all([
            Product.find(query)
                .sort(sortQuery)
                .skip(skip)
                .limit(parsedLimit),
            Product.countDocuments(query),
        ]);

        // Send response
        res.json({
            success: true,
            products,
            pagination: {
                currentPage: parsedPage,
                totalPages: Math.ceil(total / parsedLimit),
                totalItems: total,
                itemsPerPage: parsedLimit,
            },
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching products',
            error: error.message,
        });
    }
});

router.get('/categories', auth, async (req, res) => {
    try {
        const categories = ['clothing', 'accessories', 'shoes', 'other'] // Hardcoded
        // const categories = await Product.distinct('category');
        console.log('Categories fetched:', categories);
        res.json(categories);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ message: 'Error fetching categories', error: error.message });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Enhanced validation for product ID
        if (!id || id === 'undefined' || id === 'null') {
            console.log('Invalid product ID request received:', id);
            return res.status(400).json({ message: 'Invalid product ID' });
        }

        // Validate ID format if using MongoDB ObjectId
        if (!/^[0-9a-fA-F]{24}$/.test(id)) {
            console.log('Malformed product ID received:', id);
            return res.status(400).json({ message: 'Invalid product ID format' });
        }

        const product = await Product.findOne({
            _id: id,
            isActive: true,
        });

        if (!product) {
            return res.status(404).json({ message: 'Product not found or inactive' });
        }

        res.json(product);
    } catch (error) {
        console.error('Error fetching product:', error);
        res.status(500).json({ message: 'Error fetching product', error: error.message });
    }
});

router.post('/admin/add', auth, upload.single('image'), async (req, res) => {
    try {
        console.log('Step 1: Request received');

        if (req.user.role !== 'admin') {
            console.log('Step 2: Admin access denied');
            return res.status(403).json({ message: 'Admin access required' });
        }

        const { name, price, description, stock, category } = req.body;
        console.log('Step 3: Request body parsed', req.body);

        if (!req.file) {
            console.log('Step 4: No file uploaded');
            return res.status(400).json({ message: 'Product image is required' });
        }

        console.log('Step 5: File uploaded to uploads/ directory', req.file);

        let imageUrl;
        try {
            console.log('Step 6: Cloudinary upload started');
            const result = await cloudinary.uploader.upload(req.file.path, {
                folder: 'clothing-store/products',
                transformation: [{ width: 800, height: 800, crop: 'limit' }],
            });
            console.log('Step 7: Cloudinary upload completed', result);
            imageUrl = result.secure_url;
            await fs.unlink(req.file.path); // Clean up the uploaded file
            console.log('Step 8: Uploaded file deleted from uploads/ directory');
        } catch (cloudinaryError) {
            console.error('Step 9: Cloudinary upload failed', cloudinaryError);
            await fs.unlink(req.file.path).catch(() => {}); // Clean up on failure
            return res.status(500).json({ message: 'Failed to upload image', error: cloudinaryError.message });
        }

        const product = new Product({
            name,
            price,
            description,
            stock,
            category,
            image: imageUrl,
        });

        console.log('Step 10: Product created', product);

        const savedProduct = await product.save();
        console.log('Step 11: Product saved to database', savedProduct);

        return res.status(201).json({
            message: 'Product created successfully',
            product: savedProduct,
        });
    } catch (error) {
        console.error('Step 12: Error adding product', error);
        if (req.file) {
            await fs.unlink(req.file.path).catch(() => {}); // Clean up on failure
            console.log('Step 13: Uploaded file deleted from uploads/ directory due to error');
        }
        return res.status(400).json({
            message: 'Error adding product',
            error: error.message,
        });
    }
});

router.post('/admin/bulk', auth, upload.array('images', 10), async (req, res) => { // Max 10 images
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Admin access required' });
        }

        const productsData = JSON.parse(req.body.products); // Expecting JSON string of product array
        const files = req.files;

        if (!productsData || !Array.isArray(productsData) || productsData.length === 0) {
            return res.status(400).json({ message: 'Products array is required' });
        }

        if (files.length !== productsData.length) {
            return res.status(400).json({ message: 'Number of images must match number of products' });
        }

        const uploadedProducts = await Promise.all(
            productsData.map(async (productData, index) => {
                const { name, price, description, stock, category } = productData;

                // Upload image to Cloudinary
                const result = await cloudinary.uploader.upload(files[index].path, {
                    folder: 'clothing-store/products',
                    transformation: [{ width: 800, height: 800, crop: 'limit' }],
                });

                // Clean up temporary file
                await fs.unlink(files[index].path);

                const product = new Product({
                    name,
                    price,
                    description,
                    image: result.secure_url,
                    stock,
                    category,
                });

                return product.save();
            })
        );

        res.status(201).json({
            message: 'Products added successfully',
            count: uploadedProducts.length,
            products: uploadedProducts,
        });
    } catch (error) {
        console.error('Error adding bulk products:', error);

        // Clean up any uploaded files on error
        if (req.files) {
            await Promise.all(
                req.files.map(file => fs.unlink(file.path).catch(err => console.error('Cleanup error:', err)))
            );
        }

        res.status(400).json({
            message: 'Error adding bulk products',
            error: error.message,
        });
    }
});

// Admin: Update a product
router.patch('/admin/update/:id', auth, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Admin access required' });
        }

        const updates = { ...req.body };
        console.log('Request body:', req.body);
        console.log('File uploaded:', req.file);


        const product = await Product.findByIdAndUpdate(
            req.params.id,
            { ...updates, updatedAt: Date.now() },
            {
                // new: true,
                runValidators: true,
                context: 'query'
            }
        );

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        res.json({
            message: 'Product updated successfully',
            product
        });
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(400).json({
            message: 'Error updating product',
            error: error.message
        });
    }
});

// Admin: Delete a product (soft delete)
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
            product
        });
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({
            message: 'Error deleting product',
            error: error.message
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
            error: error.message
        });
    }
});

module.exports = router;