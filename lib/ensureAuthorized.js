/**
 * 2019-7-18 https://stackoverflow.com/questions/17756848/only-allow-passportjs-authenticated-users-to-visit-protected-page
 */
function ensureAuthorized(req, res, next) {
  if (!req.isAuthenticated()) { 
    req.flash('error', 'You need to login first');
    return res.redirect('/');
  }

  req.user.getReadables((err, readables) => {
    if (err) {
      return next(err);
    }
    if (readables.includes(`${req.params.domain}/${req.params.agentId}`)) {
      return next();
    }
    req.flash('error', 'You are not authorized to access that resource');
    return res.redirect('/');
  });
}

module.exports = ensureAuthorized;
