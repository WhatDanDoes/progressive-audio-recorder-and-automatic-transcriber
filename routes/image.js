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

  fs.readdir(`uploads/${req.params.domain}/${req.params.agentId}`, (err, files) => {
    if (err) {
      return res.render('error', { error: err });
    }

    files = files.filter(item => (/\.(gif|jpg|jpeg|tiff|png)$/i).test(item));
    files = files.map(file => `${req.params.domain}/${req.params.agentId}/${file}`).reverse();

    let nextPage = 0,
        prevPage = page - 1;
    if (files.length > MAX_IMGS * page) {
      nextPage = page + 1;
      files = files.slice(MAX_IMGS * prevPage, MAX_IMGS * page);
    }

    if (!nextPage && prevPage) {
      files = files.slice(MAX_IMGS * prevPage);
    }

    // To open deep link with auth token
    const payload = { email: req.user.email };
    const token = jwt.sign(payload, process.env.SECRET, { expiresIn: '1h' });

    res.render('image/index', {
      images: files,
      messages: req.flash(),
      agent: req.user,
      nextPage: nextPage,
      prevPage: prevPage,
      token: token,
      canWrite: canWrite,
      isMobile: isMobile({ ua: req, tablet: true})
     });
  });
};

/**
 * GET /image/:domain/:agentId
 */
const MAX_IMGS = 30;
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

  const currentPath = `uploads/${req.params.domain}/${req.params.agentId}/${req.params.imageId}`,
        destinationPath = `public/images/uploads/${req.params.imageId}`;

  fs.rename(currentPath, destinationPath, err => {
    if (err) {
      req.flash('info', err.message);
      return res.redirect(`/image/${req.params.domain}/${req.params.agentId}/${req.params.imageId}`);
    }

    models.Image.findOne({ path: currentPath }).then(image => {
      image.path = destinationPath;
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
