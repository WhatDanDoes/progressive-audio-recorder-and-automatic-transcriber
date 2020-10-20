require('dotenv').config();
const createError = require('http-errors');
const express = require('express');
const path = require('path');
const logger = require('morgan');
const jsonwebtoken = require('jsonwebtoken');
const models = require('./models');

const app = express();
// Cookies won't be set in production unless you trust the proxy behind which this software runs
app.set('trust proxy', 1);

/**
 * Squelch 413s, 2019-6-28 https://stackoverflow.com/a/36514330
 */
const bodyParser = require('body-parser');
app.use(bodyParser.json({limit: "50mb"}));
app.use(bodyParser.urlencoded({limit: "50mb", extended: true, parameterLimit:50000}));

/**
 * Sessions
 */
const session = require('express-session');
const MongoStore = require('connect-mongo')(session);
const env = process.env.NODE_ENV || 'development';
const config = require(__dirname + '/config/config.json')[env];

const sessionConfig = {
  name: 'wycliffe.photos',
  secret: process.env.AUTH0_CLIENT_SECRET, // This seemed convenient
  resave: false,
  saveUninitialized: false,
  unset: 'destroy',
  cookie: {
    maxAge: 1000 * 60 * 60,
    httpOnly: false,
    sameSite: 'none',
    secure: process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging'
  },
  store: new MongoStore({ mongooseConnection: models }),
  cookie: {
    secure: true,
    sameSite: 'none',
    maxAge: 1000 * 60 * 60
  }
};

app.use(session(sessionConfig));

/**
 * passport-auth0
 */
const Auth0Strategy = require('passport-auth0');
const passport = require('passport');

const strategy = new Auth0Strategy(
  {
    domain: process.env.AUTH0_DOMAIN,
    clientID: process.env.AUTH0_CLIENT_ID,
    clientSecret: process.env.AUTH0_CLIENT_SECRET,
    callbackURL: process.env.CALLBACK_URL
  },
  function(accessToken, refreshToken, extraParams, profile, done) {
    // accessToken is the token to call Auth0 API (not needed in most cases)
    // extraParams.id_token has the JSON Web Token
    // profile has all the information from the user

    models.Agent.findOne({ email: profile._json.email }).then(result => {
      if (!result) {
        let newAgent = new models.Agent(profile._json);

        newAgent.save().then(result => {
          done(null, result);
        }).catch(err => {
          done(err);
        });
      } else {
        models.Agent.findOneAndUpdate({ email: result.email }, profile._json, { new: true }).then(result => {
          return done(null, result);
        }).catch(err => {
          res.json(err);
        });
      }
    }).catch(err => {
      res.json(err);
    });
  }
);

passport.use(strategy);

passport.serializeUser(function(agent, done) {
  done(null, agent._id);
});

passport.deserializeUser(function(id, done) {
  models.Agent.findById(id).then(function(agent) {
    return done(null, agent);
  }).catch(function(error) {
    return done(error);
  });
});

app.use(passport.initialize());
app.use(passport.session());

/**
 * Flash messages
 */
const flash = require('connect-flash');
app.use(flash());


/**
 * view engine setup
 */
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Protected static assets
 */
app.use(`/uploads`, [function(req, res, next) {
  models.Image.findOne({ path: `uploads${req.path}`, published: true }).then(image => {
    if (image) {
      return next();
    }

    // Not found instead of not authorized
    if (!req.isAuthenticated()) {
      return res.sendStatus(404);
    }
    req.user.getReadables((err, readables) => {
      if (err) {
        return next(err);
      }
      for (let readable of readables) {
        if (RegExp(readable).test(req.path)) {
          return next();
        }
      }
      return res.sendStatus(403);
    });

  }).catch(err => {
    return res.sendStatus(500);
  });
}, express.static(path.join(__dirname, `/uploads`))]);

/**
 * For PUT/PATCH/DELETE
 */
const methodOverride = require('method-override');
app.use(methodOverride('_method'));

/**
 * Routes
 */
app.use('/', require('./routes/index')); // Keep a close eye on this and the following
app.use('/', require('./routes/auth'));
app.use('/image', require('./routes/image'));
app.use('/agent', require('./routes/agent'));

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

let port = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'tor' ? 3000 : 3001;
app.listen(port, '0.0.0.0', () => {
  console.log('auth0-photo-server listening on ' + port + '!');
});

module.exports = app;
