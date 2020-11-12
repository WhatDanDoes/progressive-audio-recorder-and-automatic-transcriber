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
 * GET /image
 */
router.get('/', (req, res) => {
  if (!req.isAuthenticated()) {
    req.flash('error', 'You need to login first');
    return res.redirect('/');
  }

  res.redirect(`/image/${req.user.getAgentDirectory()}`);
});

/**
 * This consolidates the functionality required of
 * - GET /image/:domain/:agentId
 * - GET /image/:domain/:agentId/page/:num
 */
function getAgentAlbum(page, req, res) {
  const canWrite = RegExp(req.user.getAgentDirectory()).test(req.path) || req.user.email === process.env.SUDO;

  models.Agent.findOne({ email: `${req.params.agentId}@${req.params.domain}` }).then(agent => {

    const query = { photographer: agent._id };
    if (agent.email !== req.user.email || (process.env.SUDO && req.user.email !== process.env.SUDO)) {
      query.flagged = false;
    }
    models.Image.find(query).limit(MAX_IMGS).skip(MAX_IMGS * (page - 1)).sort({ createdAt: 'desc' }).then(images => {

      let nextPage = 0,
          prevPage = page - 1;
      if (images.length === MAX_IMGS) {
        nextPage = page + 1;
      }

      // To open deep link with auth token
      const payload = { email: req.user.email };
      const token = jwt.sign(payload, process.env.SECRET, { expiresIn: '1h' });

      res.render('image/index', {
        images: images,
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
      return res.redirect(`/image/${req.params.domain}/${req.params.agentId}`);
    });

  }).catch(err => {
    req.flash('error', err.message);
    return res.redirect(`/image/${req.params.domain}/${req.params.agentId}`);
  });
};

/**
 * GET /image/:domain/:agentId
 */
router.get('/:domain/:agentId', ensureAuthorized, (req, res) => {

  if (!fs.existsSync(`uploads/${req.params.domain}/${req.params.agentId}`)){
    mkdirp.sync(`uploads/${req.params.domain}/${req.params.agentId}`);
  }

  return getAgentAlbum(1, req, res);
});

/**
 * GET /image/:domain/:agentId/page/:num
 */
router.get('/:domain/:agentId/page/:num', ensureAuthorized, (req, res, next) => {

  const page = parseInt(req.params.num);

  if (page <= 0) {
    return res.redirect(`/image/${req.params.domain}/${req.params.agentId}`);
  }

  return getAgentAlbum(page, req, res);
});


/**
 * GET /image/:domain/:agentId/:imageId
 */
router.get('/:domain/:agentId/:imageId', (req, res) => {
  if (!req.isAuthenticated()) {
    req.flash('error', 'You need to login first');
    return res.redirect('/');
  }

  const canWrite = RegExp(req.user.getAgentDirectory()).test(req.path) || req.user.email === process.env.SUDO;

  const filePath = `uploads/${req.params.domain}/${req.params.agentId}/${req.params.imageId}`;
  models.Image.findOne({ path: filePath })
    .populate('photographer')
    .populate('likes')
    .populate({ path: 'notes', populate: { path: 'author', model: 'Agent' }}).then(image => {

    if (image.published && !image.flagged) {
      return res.render('image/show', { image: image, messages: req.flash(), agent: req.user, canWrite: canWrite, marked: marked });
    }

    if (image.flagged) {
      req.flash('error', 'Image flagged');
      if (process.env.SUDO === req.user.email) {
        return res.render('image/show', { image: image, messages: req.flash(), agent: req.user, canWrite: canWrite, marked: marked });
      }
      return res.redirect(`/image/${req.params.domain}/${req.params.agentId}`);
    }

    req.user.getReadables((err, readables) => {
      if (err) {
        req.flash('error', err.message);
        return res.redirect('/');
      }
      if (readables.includes(`${req.params.domain}/${req.params.agentId}`)) {
        return res.render('image/show', { image: image, messages: req.flash(), agent: req.user, canWrite: canWrite, marked: marked });
      }
      req.flash('error', 'You are not authorized to access that resource');
      return res.redirect('/');
    });
  }).catch(err => {
    req.flash('error', err.message);
    return res.redirect(`/image/${req.params.domain}/${req.params.agentId}`);
  });
});

/**
 * POST /image/:domain/:agentId/:imageId
 */
router.post('/:domain/:agentId/:imageId', ensureAuthorized, (req, res) => {
  let canWrite = RegExp(req.user.getAgentDirectory()).test(req.path) || req.user.email === process.env.SUDO;

  if (process.env.SUDO && req.user.email !== process.env.SUDO) {
    return res.redirect(`/image/${req.params.domain}/${req.params.agentId}/${req.params.imageId}`);
  }

  if (!canWrite) {
    req.flash('info', 'You do not have access to that resource');
    return res.redirect(`/image/${req.params.domain}/${req.params.agentId}`);
  }

  const filePath = `uploads/${req.params.domain}/${req.params.agentId}/${req.params.imageId}`;

  models.Image.findOne({ path: filePath }).then(image => {
    const origin = url.parse(req.get('referer'));

    if (image.published) {
      image.published = null;
      req.flash('success', 'Image unpublished');
    }
    else {
      image.published = new Date();
      req.flash('success', 'Image published');
    }
    image.save().then(image => {
      res.redirect(origin.pathname || '/');
    }).catch(err => {
      req.flash('error', err.message);
      return res.redirect(`/image/${req.params.domain}/${req.params.agentId}`);
    });
  }).catch(err => {
    req.flash('error', err.message);
    return res.redirect(`/image/${req.params.domain}/${req.params.agentId}`);
  });
});

/**
 * PATCH /image/:domain/:agentId/:imageId/flag
 */
router.patch('/:domain/:agentId/:imageId/flag', ensureAuthorized, (req, res) => {
  const origin = url.parse(req.get('referer'));
  const returnTo = RegExp(req.params.domain).test(origin.pathname) ? `/image/${req.params.domain}/${req.params.agentId}` : '/';

  const filePath = `uploads/${req.params.domain}/${req.params.agentId}/${req.params.imageId}`;

  models.Image.findOne({ path: filePath }).then(image => {

    if (image.flagged && process.env.SUDO && req.user.email === process.env.SUDO) {
      image.flagged = false;
      image.save().then(result => {
        req.flash('success', 'Image deflagged');
      }).catch(err => {
        req.flash('error', err.message);
      }).finally(() => {
        res.redirect(returnTo);
      });
    }
    else if (image.flaggers.indexOf(req.user._id.toString()) > -1) {
      req.flash('error', 'This post has administrative approval');
      res.redirect(returnTo);
    }
    else {
      image.flag(req.user, (err, image) => {
        if (err) {
          req.flash('error', err.message);
        }
        else {
          req.flash('success', 'Image flagged');
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
 * PATCH /image/:domain/:agentId/:imageId/like
 */
router.patch('/:domain/:agentId/:imageId/like', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: 'You are not logged in' });
  }

  const filePath = `uploads/${req.params.domain}/${req.params.agentId}/${req.params.imageId}`;
  models.Image.findOne({ path: filePath }).then(image => {

    const likeIndex = image.likes.indexOf(req.user._id);
    if (likeIndex < 0) {
      image.likes.push(req.user._id);
    }
    else {
      image.likes.splice(likeIndex, 1);
    }
    image.save().then(result => {
      res.status(201).json(result);
    }).catch(err => {
      req.flash('error', err.message);
      return res.redirect(`/image/${req.params.domain}/${req.params.agentId}`);
    });
  }).catch(err => {
    req.flash('error', err.message);
    return res.redirect(`/image/${req.params.domain}/${req.params.agentId}`);
  });
});

/**
 * POST /image
 */
router.post('/', upload.array('docs', 8), jwtAuth, (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  // No image provided
  if (!req.files || !req.files.length) {
    return res.status(400).json({ message: 'No image provided' });
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

      models.Image.create({ path: path.dest, photographer: req.user._id }).then(image => {
        recursiveSave(done);
      }).catch(err => {
        done(err);
      });
    });
  };

  recursiveSave((err) => {
    if (err) {
      return res.status(500).json({ message: err.message });
    }
    res.status(201).json({ message: 'Image received' });
  })
});

/**
 * DELETE /image/:domain/:agentId/:imageId
 */
router.delete('/:domain/:agentId/:imageId', ensureAuthorized, function(req, res) {
  const canWrite = RegExp(req.user.getAgentDirectory()).test(req.path) || req.user.email === process.env.SUDO;
  if(!canWrite){
    req.flash('error', 'You are not authorized to delete that resource');
    return res.redirect(`/image/${req.params.domain}/${req.params.agentId}`);
  }

  const imagePath = `uploads/${req.params.domain}/${req.params.agentId}/${req.params.imageId}`;

  models.Image.deleteOne({ path: imagePath }).then(results => {
    fs.unlink(`uploads/${req.params.domain}/${req.params.agentId}/${req.params.imageId}`, (err) => {
      if (err) {
        req.flash('info', err.message);
        return res.redirect(`/image/${req.params.domain}/${req.params.agentId}`);
      }
      req.flash('info', 'Image deleted');
      res.redirect(`/image/${req.params.domain}/${req.params.agentId}`);
    });
  }).catch(err => {
    req.flash('error', err.message);
    res.redirect(`/image/${req.params.domain}/${req.params.agentId}`);
  });
});

/**
 * GET /image/flagged
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

  models.Image.find({ flagged: true }).then(images => {
    res.render('image/flagged', {
      images: images,
      messages: req.flash(),
      agent: req.user,
    });

  }).catch(err => {
    req.flash('error', err.message);
    res.redirect(`/image/${req.params.domain}/${req.params.agentId}`);
  });
});

/**
 * POST /image/:domain/:agentId/:imageId/note
 */
router.post('/:domain/:agentId/:imageId/note', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: 'You are not logged in' });
  }

  const origin = url.parse(req.get('referer'));
  const returnTo = RegExp(req.params.domain).test(origin.pathname) ? `/image/${req.params.domain}/${req.params.agentId}/${req.params.imageId}` : '/';

  const filePath = `uploads/${req.params.domain}/${req.params.agentId}/${req.params.imageId}`;
  models.Image.findOne({ path: filePath }).then(image => {

    image.notes.push({
      author: req.user,
      text: req.body.text
    });

    image.save().then(result => {
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
    return res.redirect(`/image/${req.params.domain}/${req.params.agentId}`);
  });
});

/**
 * DELETE /image/:domain/:agentId/:imageId/note/:noteId
 */
router.delete('/:domain/:agentId/:imageId/note/:noteId', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: 'You are not logged in' });
  }

  const filePath = `uploads/${req.params.domain}/${req.params.agentId}/${req.params.imageId}`;
  models.Image.findOne({ path: filePath }).then(image => {

    const note = image.notes.find(n => n._id.toString() === req.params.noteId);

    if (req.user._id.toString() !== image.photographer.toString() &&
        req.user._id.toString() !== note.author.toString() &&
        process.env.SUDO !== req.user.email) {
        return res.status(403).json({ message: 'You are not authorized to access that resource' });
    }

    image.notes.id(req.params.noteId).remove();

    const origin = url.parse(req.get('referer'));
    const returnTo = RegExp(req.params.domain).test(origin.pathname) ? `/image/${req.params.domain}/${req.params.agentId}/${req.params.imageId}` : '/';

    image.save().then(result => {
      req.flash('success', 'Note deleted');
      return res.redirect(returnTo);
    }).catch(err => {
      req.flash('error', err.message);
      return res.redirect(returnTo);
    });
  }).catch(err => {
    req.flash('error', err.message);
    return res.redirect(`/image/${req.params.domain}/${req.params.agentId}`);
  });
});



module.exports = router;
