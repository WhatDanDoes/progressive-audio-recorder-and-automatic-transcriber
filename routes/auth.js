const express = require('express');
const router = express.Router();
const passport = require('passport');
const models = require('../models');
const util = require('util');
const querystring = require('querystring');
const url = require('url');

const apiScope = require('../config/apiPermissions');
const roles = require('../config/roles');

router.get('/login', (req, res, next) => {
  const authenticator = passport.authenticate('auth0', {
    scope: 'openid email profile',
    audience: process.env.AUTH0_AUDIENCE
   });
  return authenticator(req, res, next);
});

/**
 * Perform the final stage of authentication and redirect to previously requested URL or '/'
 */

//router.get('/callback', function(req, res, next) {
//console.log("HERE I AM LORD");
//  passport.authenticate('auth0', function(err, user, info, status) {
//console.log("AND NOW HERE");
//console.log(err);
//    if (err) { return next(err) }
//    if (!user) { return res.redirect('/signin') }
//    res.redirect('/account');
//  })(req, res, next);
//});

router.get('/callback', passport.authenticate('auth0'), (req, res) => {
  if (!req.user) {
    return res.redirect('/');
  }

  function login() {
    req.login(req.user, function (err) {
      if (err) {
        return next(err);
      }

      const returnTo = req.session.returnTo;
      delete req.session.returnTo;

      // 2020-2-11 Some kind of session-saving/redirect race condition
      // https://github.com/expressjs/session/issues/360#issuecomment-552312910
      req.session.save(function(err) {
        if (err) {
          return res.json(err);
        }

        res.redirect(returnTo || '/');
      });
    });
  }

//  models.Agent.findOne({ where: { email: req.user.email } }).then(result => {
//  models.Agent.findOne({ email: req.user.email }).then(result => {
//    if (!result) {
//      let newAgent = new models.Agent({email: req.user.email});
//
//      newAgent.save().then(result => {
//        login();
//      }).catch(err => {
//        res.json(err);
//      });
//    } else {
////      result.socialProfile = req.user;
////      result.save().then(result => {
        login();
////      }).catch(err => {
////        res.json(err);
////      });
//    }
//  }).catch(err => {
//    res.json(err);
//  });
});

/**
 * 2020-3-17 https://github.com/auth0-samples/auth0-nodejs-webapp-sample/blob/master/01-Login/routes/auth.js
 *
 * Perform session logout and redirect to silid homepage
 * through Auth0 `/logout` endpoint
 */
router.get('/logout', (req, res) => {
  req.logout();

  let cookies = req.cookies;
  for (var cookie in cookies) {
    res.cookie(cookie, '', {expires: new Date(0)});
  }

  const logoutURL = new url.URL(
    util.format('https://%s/v2/logout', process.env.AUTH0_DOMAIN)
  );

  const searchString = querystring.stringify({
    client_id: process.env.AUTH0_CLIENT_ID,
    returnTo: process.env.SERVER_DOMAIN
  });
  logoutURL.search = searchString;

  req.session.destroy(err => {
    res.redirect(logoutURL);
  });
});

module.exports = router;
