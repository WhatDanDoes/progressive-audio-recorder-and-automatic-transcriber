const express = require('express');
const router = express.Router();
const passport = require('passport');
const models = require('../models');
const util = require('util');
const querystring = require('querystring');
const url = require('url');

const apiScope = require('../config/apiPermissions');
const roles = require('../config/roles');

const https = require('https');

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
router.get('/callback', passport.authenticate('auth0'), (req, res) => {
  if (!req.user) {
    return res.redirect('/');
  }

  // Save access token for Identity in session
  req.session.identity_token = req.user._doc.identity_token;
  delete req.user._doc.identity_token;

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

        req.flash('info', 'Hello, ' + req.user.email + '!');
        return res.redirect(returnTo || `/track/${req.user.getAgentDirectory()}`);
      });
    });
  };

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

  if (!process.env.IDENTITY_API) {
    req.flash('error', 'Identity API not configured');
    return login();
  }

  let data = '';
  let apiRequest = https.request(options, resp => {

    if (resp.statusCode >= 500) {
      req.flash('error', 'Identity API is down');
    }
    else if (resp.statusCode >= 400) {
      req.flash('error', 'Identity API authorization failed');
    }

    resp.setEncoding('utf8');
    resp.on('data', chunk => {
      data += chunk;
    });

    resp.on('end', () => {
      if (resp.statusCode >= 400) {
        login();
      }
      else {
        models.Agent.findOneAndUpdate({ email: req.user.email }, JSON.parse(data), { new: true }).then(result => {
          login();
        }).catch(err => {
          res.json(err);
          console.error('NOT GORD');
          console.error(err);
        });
      }
    });
  }).on('error', err => {
    console.log(err);
    req.flash('error', 'Identity API not configured');
    login();
  });

  apiRequest.end();
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

  //
  // According to: https://auth0.com/docs/api/authentication#logout
  //
  // "If the client_id parameter is NOT included, the returnTo URL must be
  // listed in the Allowed Logout URLs set at the tenant level"
  //
  // Go to: Tenant Settings > Advanced > Allowed Logout URLs
  //
  const searchString = querystring.stringify({
    //client_id: 'Don\'t set this',
    returnTo: `${process.env.SINGLE_SIGN_OUT_DOMAIN}?returnTo=${process.env.SERVER_DOMAIN}`
  });
  logoutURL.search = searchString;

  req.session.destroy(err => {
    res.redirect(logoutURL);
  });
});

module.exports = router;
