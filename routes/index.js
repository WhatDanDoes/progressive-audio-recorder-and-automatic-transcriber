const router = require('express').Router();
const models = require('../models');

const MAX_IMGS = parseInt(process.env.MAX_IMGS);

/**
 * This consolidates the functionality required of
 * - GET /
 * - GET /page/:num
 */

function getMainAudioLibrary(page, req, res) {
  models.Track.find({ published: { '$ne': null }, flagged: false })
    .populate('recordist')
    .populate('likes')
    .skip(MAX_IMGS * (page - 1)).limit(MAX_IMGS).sort({ published: 'desc' }).then(tracks => {

    let nextPage = page + 1,
        prevPage = page - 1;
    if (tracks.length < MAX_IMGS) {
      nextPage = 0;
    }

    res.render('index', { tracks: tracks, messages: req.flash(), agent: req.user, nextPage: nextPage, prevPage: prevPage });
  }).catch(err => {
    req.flash('error', err.message);
    return res.redirect('/');
  });
}

/* GET home page. */

router.get('/', (req, res) => {
  return getMainAudioLibrary(1, req, res);
});

router.get('/page/:num', (req, res) => {
  const page = parseInt(req.params.num);

  if (page <= 0) {
    return res.redirect('/');
  }

  return getMainAudioLibrary(page, req, res);
});

module.exports = router;
