'use strict';

const express = require('express');
const passport = require('passport');
const router = express.Router();
const jwt = require('jsonwebtoken');
const jwtAuth = require('../lib/jwtAuth');
const models = require('../models');


router.post('/', function(req, res, next) {
  passport.authenticate('local', function(err, user, info) {
    if (err) {
      return next(err);
    }
    if (!user) {
      if (req.accepts('text/html')) {
        req.flash('error', 'Invalid email or password');
        return res.redirect('/');
      }
      return res.status(401).json({message: 'Invalid email or password'});
    }
    req.logIn(user, function(err) {
      if (err) {
        return next(err);
      }
      req.flash('info', 'Hello, ' + req.user.email + '!');
      res.redirect(`/image/${req.user.getAgentDirectory()}`);
    });
  })(req, res, next);
});

router.post('/api', function(req, res, next) {
  models.Agent.findOne({ email: req.body.email }).then(function(agent) {
    if (!agent) {
      return res.status(401).json({message: 'Invalid email or password'});
    }
    models.Agent.validPassword(req.body.password, agent.password, function(err, agent) {
      if (err) {
        return res.status(401).json({message: err.message });
      }
      if (!agent) {
        return res.status(401).json({message: 'Invalid email or password' });
      }
      const payload = { email: agent.email };
      const token = jwt.sign(payload, process.env.SECRET, { expiresIn: '1h' });
      return res.status(201).json({message: 'Hello, ' + agent.email + '!', token: token });

    }, agent);
  }).catch(function(err) {
    return done(err);
  });
});


router.post('/refresh', jwtAuth,  function(req, res, next) {
  const token = jwt.sign({ email: req.user.email }, process.env.SECRET, { expiresIn: '1h' });
  return res.status(201).json({message: 'Welcome back, ' + req.user.email + '!', token: token });
});

module.exports = router;
