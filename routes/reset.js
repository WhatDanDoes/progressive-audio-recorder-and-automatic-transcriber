'use strict';

/**
 * 2017-2-10
 * Password reset adapted from: http://sahatyalkabov.com/how-to-implement-password-reset-in-nodejs/
 */

const express = require('express');
const passport = require('passport');
const router = express.Router();
const models = require('../models');
const crypto = require('crypto');
const mailer = require('../mailer');
const bcrypt = require('bcrypt');

router.get('/', (req, res) => {
  res.render('forgot', { messages: req.flash(), agent: null });
});

router.get('/:token', (req, res) => {
  models.Agent.findOne({ resetPasswordToken: req.params.token, resetPasswordExpires: { $gt: Date.now() } }).then((agent) => {
    if (!agent) {
      req.flash('error', 'Password reset token is invalid or has expired');
      return res.redirect('/reset');
    }
    res.render('reset', { token: req.params.token, messages: req.flash(), agent: null });
  }).catch((err) => {
    return res.sendStatus(501);
  });
});


router.post('/', (req, res) => {
  models.Agent.findOne({ email: req.body.email }).then((agent) => {
    if (!agent) {
      req.flash('error', 'No account with that email address has been registered');
      return res.redirect('/reset');
    }
    crypto.randomBytes(20, (err, buf) => {
      agent.resetPasswordToken = buf.toString('hex');
      agent.resetPasswordExpires = Date.now() + 3600000; // 1 hour

      models.Agent.findByIdAndUpdate(agent._id, agent).then((results) => {
        let mailOptions = {
          to: agent.email,
          from: process.env.FROM,
          subject: 'Accountant Password Reset',
          text: 'You are receiving this because you (or someone else) has requested a password reset.\n\n' +
                'Please click on the following link, or paste this into your browser to complete the process:\n\n' +
                'https://' + req.headers.host + '/reset/' + agent.resetPasswordToken + '\n\n' +
                'If you did not request this, please ignore this email and your password will remain unchanged.\n'
        };
        mailer.transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            console.error('Mailer Error', error);
            return res.sendStatus(501);
          }
          req.flash('success', 'An email has been sent to ' + req.body.email + ' with further instructions');
          res.redirect('/reset');
        });
      }).catch((err) => {
        return res.sendStatus(501);
      });
    });
  }).catch((err) => {
    return res.sendStatus(501);
  });
});

const saltRounds = 10;

router.patch('/:token', function(req, res) {

  if (req.body.password !== req.body.confirm) {
    req.flash('error', 'Passwords don\'t match');
    return res.render('reset', { token: req.params.token, messages: req.flash(), agent: null });
  }

  models.Agent.findOne({ resetPasswordToken: req.params.token, resetPasswordExpires: { $gt: Date.now() } }).then((agent) => {
    if (!agent) {
      req.flash('error', 'Password reset token is invalid or has expired.');
      return res.redirect('/reset');
    }

    bcrypt.hash(req.body.password, saltRounds, function(err, hash) {
      if (err) return res.sendStatus(501);
      agent.password = hash;
      agent.resetPasswordToken = undefined;
      agent.resetPasswordExpires = undefined;

      models.Agent.findByIdAndUpdate(agent._id, agent).then((results) => {
  
        res.redirect('/');
      }).catch((err) => {
        return res.sendStatus(501);
      });
    });
  }).catch((err) => {
    return res.sendStatus(501);
  });
});

module.exports = router;
