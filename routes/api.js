const timestamp = require('time-stamp');
const base64Img = require('base64-img');

const router = require('express').Router();

router.post('/', function(req, res, next) {
  base64Img.img('data:image/jpeg;base64,'+req.body.base64Image, './public/images/uploads', timestamp.utc('YYMMDDHHmmss'), (err, filepath) => {
    if (err) {
      return res.status(500).json({ message: err.message });
    }

    res.status(201).json({ message: 'Image received' });
  });
});

module.exports = router;
