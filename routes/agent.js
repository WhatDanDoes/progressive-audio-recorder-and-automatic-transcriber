'use strict';

const https = require('https');
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

    if (process.env.IDENTITY_API) {
      const options = {
        host: process.env.IDENTITY_API,
        port: 443,
        path: '/agent',
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${req.session.identity_token}`
        }
      };

      let data = '';
      let apiRequest = https.request(options, resp => {

        resp.setEncoding('utf8');
        resp.on('data', chunk => {
          data += chunk;
        });

        resp.on('end', () => {

          if (resp.statusCode >= 400) {
            req.flash('error', 'Could not sync with Identity. Cached data shown.');
            res.render('agent/index', {
              messages: req.flash(),
              agent: req.user,
              readables: readables,
            });
          }
          else {
            models.Agent.findOneAndUpdate({ email: req.user.email }, JSON.parse(data), { new: true }).then(result => {
              res.render('agent/index', {
                messages: req.flash(),
                agent: req.user,
                readables: readables,
              });
            }).catch(err => {
              res.json(err);
              console.error('NOT GORD');
              console.error(err);
            });
          }
        });
      }).on('error', err => {
        req.flash('error', 'Could not sync with Identity. Cached data shown.');
        res.render('agent/index', {
          messages: req.flash(),
          agent: req.user,
          readables: readables,
        });
      });

      apiRequest.end();
    }
    else {
      res.render('agent/index', {
        messages: req.flash(),
        agent: req.user,
        readables: readables,
      });
    }
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
