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

    models.Image.find({ photographer: agent._id, published: false }).limit(MAX_IMGS).skip(MAX_IMGS * (page - 1)).sort({ updatedAt: 'desc' }).then(images => {

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
router.get('/:domain/:agentId/:imageId', ensureAuthorized, (req, res) => {
  const canWrite = RegExp(req.user.getAgentDirectory()).test(req.path) || req.user.email === process.env.SUDO;
  res.render('image/show', { image: `${req.path}`, messages: req.flash(), agent: req.user, canWrite: canWrite });
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
    image.published = true;
    image.save().then(image => {
      req.flash('success', 'Image published');
      res.redirect('/');
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
 * PUT /image
 */
//router.put('/:id', (req, res) => {
//  if (!req.isAuthenticated()) { return res.sendStatus(401); }
//
//  // Can only edit if a reviewer or submitter (except approval)
//  models.Agent.findById(req.user._id).then((agent) => {
//    models.Image.findById(req.params.id).populate('files album').then((image) => {
//      // Approved images cannot be changed unless dis-approved by a reviewer
//      let disapproved = false;
//      let approvalChange = req.body.approved !== undefined;
//      let notReviewer = agent.reviewables.indexOf(image.album._id.toString()) == -1;
//      if (image.approved) {
//        if (notReviewer) return res.sendStatus(403);
//        if (!approvalChange) disapproved = true;
//        else {
//          req.flash('error', 'Cannot update an approved image');
//          return res.render('image/show', { image: image, agent: agent, messages: req.flash() });
//        }
//      }
//
//      let notSubmitter = image.agent.toString() != agent._id.toString();
//      if (notSubmitter && notReviewer) return res.sendStatus(403);
//      if (notReviewer && approvalChange) return res.sendStatus(403);
//
//      image = Object.assign(image, req.body);
//      if (!req.body.approved) image.approved = false;
//      let sum = image.tookPlaceAt.getTimezoneOffset() * 60000 + Date.parse(image.tookPlaceAt); // [min*60000 = ms]
//      models.Image.findOneAndUpdate({ _id: req.params.id }, image, { new: true, runValidators: true }).then((image) => {
//        if (disapproved) {
//          req.flash('info', 'Image de-approved. It can now be edited.');
//          res.redirect('/image/' + image._id);
//        }
//        else {
//          req.flash('info', 'Image successfully updated');
//          res.redirect('/album/' + image.album);
//        }
//      }).catch((error) => {
//        return res.render('image/show', { image: image, agent: agent, messages: error });
//      });
//    }).catch((error) => {
//      return res.sendStatus(501);
//    });
//  }).catch((error) => {
//    return res.sendStatus(501);
//  });
//});
//

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
    req.flash('error', err.mesage);
    res.redirect(`/image/${req.params.domain}/${req.params.agentId}`);
  });
});

module.exports = router;
