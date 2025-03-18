const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        console.log('Saving file to uploads/ directory');
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const filename = Date.now() + path.extname(file.originalname);
        console.log('Generated filename:', filename);
        cb(null, filename);
    },
});

const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only images are allowed'), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per file
});

module.exports = upload;

