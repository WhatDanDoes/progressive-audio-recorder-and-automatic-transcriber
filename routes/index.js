const router = require('express').Router();
const models = require('../models');

const MAX_IMGS = parseInt(process.env.MAX_IMGS);

/**
 * This consolidates the functionality required of
 * - GET /
 * - GET /page/:num
 */

function getMainPhotoRoll(page, req, res) {
  models.Image.find({ published: true }).populate('photographer').skip(MAX_IMGS * (page - 1)).limit(MAX_IMGS).sort({ updatedAt: 'desc' }).then(images => {

    let nextPage = page + 1,
        prevPage = page - 1;
    if (images.length < MAX_IMGS) {
      nextPage = 0;
    }

    res.render('index', { images: images, messages: req.flash(), agent: req.user, nextPage: nextPage, prevPage: prevPage });

  }).catch(err => {
    req.flash('error', err.message);
    return res.redirect('/');
  });
}

/* GET home page. */

router.get('/', (req, res) => {
  return getMainPhotoRoll(1, req, res);
});

router.get('/page/:num', (req, res) => {
  const page = parseInt(req.params.num);

  if (page <= 0) {
    return res.redirect('/');
  }

  return getMainPhotoRoll(page, req, res);
});

module.exports = router;
