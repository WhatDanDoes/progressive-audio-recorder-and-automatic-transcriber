'use strict';

const express = require('express');
const passport = require('passport');
const router = express.Router();
const multer  = require('multer');
const models = require('../models');
const timestamp = require('time-stamp');
const mv = require('mv');
const jwt = require('jsonwebtoken');
const jwtAuth = require('../lib/jwtAuth');
const ensureAuthorized = require('../lib/ensureAuthorized');
const fs = require('fs');
const mkdirp = require('mkdirp');
const isMobile = require('is-mobile');
const url = require('url');
const marked = require('marked');

const MAX_IMGS = parseInt(process.env.MAX_IMGS);

// Set upload destination directory
let storage = multer.diskStorage({
  destination: '/tmp',
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
let upload = multer({ storage: storage });

/**
 * GET /track
 */
router.get('/', (req, res) => {
  if (!req.isAuthenticated()) {
    req.flash('error', 'You need to login first');
    return res.redirect('/');
  }

  res.redirect(`/track/${req.user.getAgentDirectory()}`);
});

/**
 * This consolidates the functionality required of
 * - GET /track/:domain/:agentId
 * - GET /track/:domain/:agentId/page/:num
 */
function getAgentAlbum(page, req, res) {
  const canWrite = RegExp(req.user.getAgentDirectory()).test(req.path) || req.user.email === process.env.SUDO;

  models.Agent.findOne({ email: `${req.params.agentId}@${req.params.domain}` }).then(agent => {

    const query = { recordist: agent._id };
    if (agent.email !== req.user.email || (process.env.SUDO && req.user.email !== process.env.SUDO)) {
      query.flagged = false;
    }
    models.Track.find(query).limit(MAX_IMGS).skip(MAX_IMGS * (page - 1)).sort({ createdAt: 'desc' }).then(tracks => {

      let nextPage = 0,
          prevPage = page - 1;
      if (tracks.length === MAX_IMGS) {
        nextPage = page + 1;
      }

      // To open deep link with auth token
      const payload = { email: req.user.email };
      const token = jwt.sign(payload, process.env.SECRET, { expiresIn: '1h' });

      res.render('track/index', {
        tracks: tracks,
        messages: req.flash(),
        agent: req.user,
        nextPage: nextPage,
        prevPage: prevPage,
        token: token,
        canWrite: canWrite,
        isMobile: isMobile({ ua: req, tablet: true})
       });
    }).catch(err => {
      req.flash('error', err.message);
      return res.redirect(`/track/${req.params.domain}/${req.params.agentId}`);
    });

  }).catch(err => {
    req.flash('error', err.message);
    return res.redirect(`/track/${req.params.domain}/${req.params.agentId}`);
  });
};

/**
 * GET /track/:domain/:agentId
 */
router.get('/:domain/:agentId', ensureAuthorized, (req, res) => {

  if (!fs.existsSync(`uploads/${req.params.domain}/${req.params.agentId}`)){
    mkdirp.sync(`uploads/${req.params.domain}/${req.params.agentId}`);
  }

  return getAgentAlbum(1, req, res);
});

/**
 * GET /track/:domain/:agentId/page/:num
 */
router.get('/:domain/:agentId/page/:num', ensureAuthorized, (req, res, next) => {

  const page = parseInt(req.params.num);

  if (page <= 0) {
    return res.redirect(`/track/${req.params.domain}/${req.params.agentId}`);
  }

  return getAgentAlbum(page, req, res);
});


/**
 * GET /track/:domain/:agentId/:trackId
 */
router.get('/:domain/:agentId/:trackId', (req, res) => {
  if (!req.isAuthenticated()) {
    req.flash('error', 'You need to login first');
    return res.redirect('/');
  }

  const canWrite = RegExp(req.user.getAgentDirectory()).test(req.path) || req.user.email === process.env.SUDO;

  const filePath = `uploads/${req.params.domain}/${req.params.agentId}/${req.params.trackId}`;
  models.Track.findOne({ path: filePath })
    .populate('recordist')
    .populate('likes')
    .populate({ path: 'notes', populate: { path: 'author', model: 'Agent' }}).then(track => {

    if (track.published && !track.flagged) {
      return res.render('track/show', { track: track, messages: req.flash(), agent: req.user, canWrite: canWrite, marked: marked });
    }

    if (track.flagged) {
      req.flash('error', 'Track flagged');
      if (process.env.SUDO === req.user.email) {
        return res.render('track/show', { track: track, messages: req.flash(), agent: req.user, canWrite: canWrite, marked: marked });
      }
      return res.redirect(`/track/${req.params.domain}/${req.params.agentId}`);
    }

    req.user.getReadables((err, readables) => {
      if (err) {
        req.flash('error', err.message);
        return res.redirect('/');
      }
      if (readables.includes(`${req.params.domain}/${req.params.agentId}`)) {
        return res.render('track/show', { track: track, messages: req.flash(), agent: req.user, canWrite: canWrite, marked: marked });
      }
      req.flash('error', 'You are not authorized to access that resource');
      return res.redirect('/');
    });
  }).catch(err => {
    req.flash('error', err.message);
    return res.redirect(`/track/${req.params.domain}/${req.params.agentId}`);
  });
});

/**
 * POST /track/:domain/:agentId/:trackId
 */
router.post('/:domain/:agentId/:trackId', ensureAuthorized, (req, res) => {
  let canWrite = RegExp(req.user.getAgentDirectory()).test(req.path) || req.user.email === process.env.SUDO;

  if (process.env.SUDO && req.user.email !== process.env.SUDO) {
    return res.redirect(`/track/${req.params.domain}/${req.params.agentId}/${req.params.trackId}`);
  }

  if (!canWrite) {
    req.flash('info', 'You do not have access to that resource');
    return res.redirect(`/track/${req.params.domain}/${req.params.agentId}`);
  }

  const filePath = `uploads/${req.params.domain}/${req.params.agentId}/${req.params.trackId}`;

  models.Track.findOne({ path: filePath }).then(track => {
    const origin = url.parse(req.get('referer'));

    if (track.published) {
      track.published = null;
      req.flash('success', 'Track unpublished');
    }
    else {
      track.published = new Date();
      req.flash('success', 'Track published');
    }
    track.save().then(track => {
      res.redirect(origin.pathname || '/');
    }).catch(err => {
      req.flash('error', err.message);
      return res.redirect(`/track/${req.params.domain}/${req.params.agentId}`);
    });
  }).catch(err => {
    req.flash('error', err.message);
    return res.redirect(`/track/${req.params.domain}/${req.params.agentId}`);
  });
});

/**
 * PATCH /track/:domain/:agentId/:trackId/flag
 */
router.patch('/:domain/:agentId/:trackId/flag', ensureAuthorized, (req, res) => {
  const origin = url.parse(req.get('referer'));
  const returnTo = RegExp(req.params.domain).test(origin.pathname) ? `/track/${req.params.domain}/${req.params.agentId}` : '/';

  const filePath = `uploads/${req.params.domain}/${req.params.agentId}/${req.params.trackId}`;

  models.Track.findOne({ path: filePath }).then(track => {

    if (track.flagged && process.env.SUDO && req.user.email === process.env.SUDO) {
      track.flagged = false;
      track.save().then(result => {
        req.flash('success', 'Track deflagged');
      }).catch(err => {
        req.flash('error', err.message);
      }).finally(() => {
        res.redirect(returnTo);
      });
    }
    else if (track.flaggers.indexOf(req.user._id.toString()) > -1) {
      req.flash('error', 'This post has administrative approval');
      res.redirect(returnTo);
    }
    else {
      track.flag(req.user, (err, track) => {
        if (err) {
          req.flash('error', err.message);
        }
        else {
          req.flash('success', 'Track flagged');
        }

        res.redirect(returnTo);
      });
    }
  }).catch(err => {
    req.flash('error', err.message);
    return res.redirect(returnTo);
  });
});

/**
 * PATCH /track/:domain/:agentId/:trackId/like
 */
router.patch('/:domain/:agentId/:trackId/like', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: 'You are not logged in' });
  }

  const filePath = `uploads/${req.params.domain}/${req.params.agentId}/${req.params.trackId}`;
  models.Track.findOne({ path: filePath }).then(track => {

    const likeIndex = track.likes.indexOf(req.user._id);
    if (likeIndex < 0) {
      track.likes.push(req.user._id);
    }
    else {
      track.likes.splice(likeIndex, 1);
    }
    track.save().then(result => {
      res.status(201).json(result);
    }).catch(err => {
      req.flash('error', err.message);
      return res.redirect(`/track/${req.params.domain}/${req.params.agentId}`);
    });
  }).catch(err => {
    req.flash('error', err.message);
    return res.redirect(`/track/${req.params.domain}/${req.params.agentId}`);
  });
});

/**
 * POST /track
 */
router.post('/', upload.array('docs', 8), function(req, res, next) {
    // If coming from the native app
    if (req.headers['accept'] === 'application/json') {
      return jwtAuth(req, res, next);
    }
    // Non-native app authorization
    next();
  }, (req, res) => {

  if (!req.isAuthenticated()) {
    if (req.headers['accept'] === 'application/json') {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    req.flash('error', 'You need to login first');
    return res.redirect('/');
  }

  // No track provided
  if (!req.files || !req.files.length) {
    if (req.headers['accept'] === 'application/json') {
      return res.status(400).json({ message: 'No track provided' });
    }
    req.flash('error', 'No track provided');
    return res.redirect(req.headers.referer);
  }

  let savePaths = [];
  let index = 0;
  for (let file of req.files) {
    let newFileName = `${timestamp('YYYY-MM-DD-HHmmssms')}`;
    if (req.files.length > 1) {
      newFileName = `${newFileName}-${index++}`;
    }
    newFileName = `${newFileName}.${file.path.split('.').pop()}`;

    let parts = req.user.email.split('@');
    const agentDirectory = `${parts[1]}/${parts[0]}` ;
    savePaths.push({
      curr: file.path,
      dest: `uploads/${agentDirectory}/${newFileName}`
    });
  }

  function recursiveSave(done) {
    if (!savePaths.length) {
      return done();
    }
    let path = savePaths.pop();
    mv(path.curr, path.dest, { mkdirp: true }, function(err) {
      if (err) {
        return done(err);
      }

      models.Track.create({ path: path.dest, recordist: req.user._id }).then(track => {
        recursiveSave(done);
      }).catch(err => {
        done(err);
      });
    });
  };

  recursiveSave((err) => {
    if (err) {
      if (req.headers['accept'] === 'application/json') {
        return res.status(500).json({ message: err.message });
      }
      req.flash('error', err.message);
      return res.redirect(req.headers.referer);
    }
    if (req.headers['accept'] === 'application/json') {
      return res.status(201).json({ message: 'Track received' });
    }
    req.flash('success', 'Track received');
    return res.redirect(req.headers.referer);
  });
});

/**
 * DELETE /track/:domain/:agentId/:trackId
 */
router.delete('/:domain/:agentId/:trackId', ensureAuthorized, function(req, res) {
  const canWrite = RegExp(req.user.getAgentDirectory()).test(req.path) || req.user.email === process.env.SUDO;
  if(!canWrite){
    req.flash('error', 'You are not authorized to delete that resource');
    return res.redirect(`/track/${req.params.domain}/${req.params.agentId}`);
  }

  const trackPath = `uploads/${req.params.domain}/${req.params.agentId}/${req.params.trackId}`;

  models.Track.deleteOne({ path: trackPath }).then(results => {
    fs.unlink(`uploads/${req.params.domain}/${req.params.agentId}/${req.params.trackId}`, (err) => {
      if (err) {
        req.flash('info', err.message);
        return res.redirect(`/track/${req.params.domain}/${req.params.agentId}`);
      }
      req.flash('info', 'Track deleted');
      res.redirect(`/track/${req.params.domain}/${req.params.agentId}`);
    });
  }).catch(err => {
    req.flash('error', err.message);
    res.redirect(`/track/${req.params.domain}/${req.params.agentId}`);
  });
});

/**
 * GET /track/flagged
 */
router.get('/flagged', (req, res) => {
  if (!req.isAuthenticated()) {
    req.flash('error', 'You need to login first');
    return res.redirect('/');
  }

  if (!process.env.SUDO || process.env.SUDO !== req.user.email) {
    req.flash('error', 'You are not authorized to access that resource');
    return res.redirect('/');
  }

  models.Track.find({ flagged: true }).then(tracks => {
    res.render('track/flagged', {
      tracks: tracks,
      messages: req.flash(),
      agent: req.user,
    });

  }).catch(err => {
    req.flash('error', err.message);
    res.redirect(`/track/${req.params.domain}/${req.params.agentId}`);
  });
});

/**
 * POST /track/:domain/:agentId/:trackId/note
 */
router.post('/:domain/:agentId/:trackId/note', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: 'You are not logged in' });
  }

  const origin = url.parse(req.get('referer'));
  const returnTo = RegExp(req.params.domain).test(origin.pathname) ? `/track/${req.params.domain}/${req.params.agentId}/${req.params.trackId}` : '/';

  const filePath = `uploads/${req.params.domain}/${req.params.agentId}/${req.params.trackId}`;
  models.Track.findOne({ path: filePath }).then(track => {

    track.notes.push({
      author: req.user,
      text: req.body.text
    });

    track.save().then(result => {
      req.flash('success', 'Note posted');
      return res.redirect(returnTo);
    }).catch(err => {
      if (RegExp('Empty note not saved').test(err.message)) {
        req.flash('error', 'Empty note not saved');
      }
      else {
        req.flash('error', err.message);
      }
      return res.redirect(returnTo);
    });
  }).catch(err => {
    req.flash('error', err.message);
    return res.redirect(`/track/${req.params.domain}/${req.params.agentId}`);
  });
});

/**
 * DELETE /track/:domain/:agentId/:trackId/note/:noteId
 */
router.delete('/:domain/:agentId/:trackId/note/:noteId', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: 'You are not logged in' });
  }

  const filePath = `uploads/${req.params.domain}/${req.params.agentId}/${req.params.trackId}`;
  models.Track.findOne({ path: filePath }).then(track => {

    const note = track.notes.find(n => n._id.toString() === req.params.noteId);

    if (req.user._id.toString() !== track.recordist.toString() &&
        req.user._id.toString() !== note.author.toString() &&
        process.env.SUDO !== req.user.email) {
        return res.status(403).json({ message: 'You are not authorized to access that resource' });
    }

    track.notes.id(req.params.noteId).remove();

    const origin = url.parse(req.get('referer'));
    const returnTo = RegExp(req.params.domain).test(origin.pathname) ? `/track/${req.params.domain}/${req.params.agentId}/${req.params.trackId}` : '/';

    track.save().then(result => {
      req.flash('success', 'Note deleted');
      return res.redirect(returnTo);
    }).catch(err => {
      req.flash('error', err.message);
      return res.redirect(returnTo);
    });
  }).catch(err => {
    req.flash('error', err.message);
    return res.redirect(`/track/${req.params.domain}/${req.params.agentId}`);
  });
});



module.exports = router;