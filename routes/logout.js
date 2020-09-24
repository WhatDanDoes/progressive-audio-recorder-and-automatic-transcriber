const express = require('express');
const passport = require('passport');
const router = express.Router();
const models = require('../models');

router.get('/', function(req, res) {
  req.logout();
  req.session = null;
  return res.redirect('/');
});


module.exports = router;

