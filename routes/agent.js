'use strict';

const express = require('express');
const router = express.Router();
const models = require('../models');

/**
 * GET /agent
 */
router.get('/', function(req, res) {
  if (!req.isAuthenticated()) {
    req.flash('error', 'You need to login first');
    return res.redirect('/');
  }
  req.user.getReadables(function(err, readables) {

    res.render('agent/index', {
      messages: req.flash(),
      agent: req.user,
      readables: readables,
    });
  });
});

/**
 * GET /agent/admin
 */
router.get('/admin', function(req, res) {
  if (!req.isAuthenticated() || req.user.email !== process.env.SUDO) {
    req.flash('error', 'Unauthorized');
    return res.redirect('/');
  }

  models.Agent.find({ email: { $ne: req.user.email } }).sort({ 'updatedAt': 'desc' }).then(activeAgents => {
    res.render('agent/admin', {
      messages: req.flash(),
      agent: req.user,
      activeAgents: activeAgents
    });
  }).catch(err => {
    req.flash('error', err.message);
    res.render('agent/admin', {
      messages: req.flash(),
      agent: req.user,
      activeAgents: []
    });
  });
});


module.exports = router;
