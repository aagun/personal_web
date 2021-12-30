const multer = require('multer');

// Init multer diskStorage
// Destination folder
const fileStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads'); //location uploaded files
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname); // add date now to orginal name file
  },
});

const fileFilter = (req, file, cb) => {
  if (
    file.mimetype === 'image/jpg' ||
    file.mimetype === 'image/jpeg' ||
    file.mimetype === 'image/png'
  ) {
    cb(null, true);
  } else {
    cb(null, false);
  }
};

const upload = multer({ storage: fileStorage, fileFilter: fileFilter });

module.exports = upload;
