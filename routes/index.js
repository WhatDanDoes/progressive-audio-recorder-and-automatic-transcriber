const router = require('express').Router();
const fs = require('fs');
const models = require('../models');

const MAX_IMGS = parseInt(process.env.MAX_IMGS);


/**
 * This consolidates the functionality required of
 * - GET /
 * - GET /page/:num
 */

function getMainPhotoRoll(page, req, res) {
  if (req.user) {
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
  else {
    fs.readdir('public/images/uploads', (err, files) => {
      if (err) {
        return res.render('error', { error: err, message: 'Couldn\'t read upload directory' });
      }

      files = files.filter(item => (/\.(gif|jpg|jpeg|tiff|png)$/i).test(item)).reverse();

      let nextPage = 0,
          prevPage = page - 1;
      if (files.length > MAX_IMGS * page) {
        nextPage = page + 1;
        files = files.slice(MAX_IMGS * prevPage, MAX_IMGS * page);
      }

      if (!nextPage && prevPage) {
        files = files.slice(MAX_IMGS * prevPage);
      }

      res.render('index', { images: files, messages: req.flash(), agent: req.user, nextPage: nextPage, prevPage: prevPage });
    });
  }
}

/* GET home page. */

router.get('/', function(req, res, next) {
  return getMainPhotoRoll(1, req, res);
});

router.get('/page/:num', function(req, res, next) {
  const page = parseInt(req.params.num);

  if (page <= 0) {
    return res.redirect('/');
  }

  return getMainPhotoRoll(page, req, res);
});

module.exports = router;
