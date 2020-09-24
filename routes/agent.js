'use strict';

const express = require('express');
const passport = require('passport');
const router = express.Router();
const models = require('../models');
const fs = require('fs');
const jwt = require('jsonwebtoken');

/**
 * GET /agent
 */
router.get('/', function(req, res) {
  if (!req.isAuthenticated()) { 
    req.flash('error', 'You need to login first');
    return res.redirect('/');
  }
  req.user.getReadables(function(err, readables) {

    // To open deep link with auth token
    const payload = { email: req.user.email };
    const token = jwt.sign(payload, process.env.SECRET, { expiresIn: '1h' });

    res.render('agent/index', { messages: req.flash(), agent: req.user, readables: readables, token: token});
  });
});



module.exports = router;
