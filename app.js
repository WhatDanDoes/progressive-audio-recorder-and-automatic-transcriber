require('dotenv').config();
const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const jsonwebtoken = require('jsonwebtoken');
const models = require('./models');

const app = express();

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
  secret: 'supersecretkey',
  resave: false,
  saveUninitialized: false,
  unset: 'destroy',
  cookie: { maxAge: 1000 * 60 * 60 },
  store: new MongoStore({ mongooseConnection: models }),
};

//if (env == 'production') {
//  sessionConfig.store = new MongoStore({ mongooseConnection: models });
//}

app.use(session(sessionConfig));


/**
 * Passport authentication
 *
 * Local strategy
 */
//const passport = require('passport');
//const LocalStrategy = require('passport-local').Strategy;
//
//app.use(passport.initialize());
//app.use(passport.session());
//passport.use(new LocalStrategy({
//    usernameField: 'email'
//  },
//  function(email, password, done) {
//    models.Agent.findOne({ email: email }).then(function(agent) {
//      if (!agent) {
//        return done(null, false);
//      }
//      models.Agent.validPassword(password, agent.password, function(err, res) {
//        if (err) {
//          console.log(err);
//        }
//        return done(err, res);
//      }, agent);
//    }).catch(function(err) {
//      return done(err);
//    });
//
//  }));
//
//passport.serializeUser(function(agent, done) {
//  done(null, agent._id);
//});
//
//passport.deserializeUser(function(id, done) {
//  models.Agent.findById(id).then(function(agent) {
//    return done(null, agent);
//  }).catch(function(error) {
//    return done(error);
//  });
//});


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

    /**
     * 2020-3-19 https://community.auth0.com/t/how-to-check-role-of-user-in-express-application/27525/8
     */
//    let decoded = jsonwebtoken.decode(accessToken);

//    const managementClient = getManagementClient(apiScope.read.users);
//    managementClient.getUser({id: profile.user_id}).then(agent => {
//      if (!agent.user_metadata) {
//        agent.user_metadata = {};
//      }
//
//      agent.scope = decoded.permissions;
//

//console.log('wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwword');
//    models.Agent.findOne({ email: profile._json.email }).then(function(agent) {
//      if (!agent) {
//        return done(null, false);
//      }
//console.log(agent);
//      return done(null, agent);
//    }).catch(err => {
//      return done(err);
//    });
//
  models.Agent.findOne({ email: profile._json.email }).then(result => {
    if (!result) {
      let newAgent = new models.Agent({email: profile._json.email});

      newAgent.save().then(result => {
        return done(null, result);
      }).catch(err => {
        res.json(err);
      });
    } else {
console.log(result);
      return done(null, result);
    }
  }).catch(err => {
    res.json(err);
  });



//    }).catch(err => {
//      return done(err);
//    });
  }
);

passport.use(strategy);

//passport.serializeUser(function(user, done) {
//  done(null, user);
//});
//
//passport.deserializeUser(function(idToken, done) {
//  done(null, idToken);
//});

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
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Protected static assets
 */
app.use(`/uploads`, [function(req, res, next) {
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
//app.use('/login', require('./routes/login'));
app.use('/logout', require('./routes/logout'));
app.use('/reset', require('./routes/reset'));
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

//let port = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'tor' ? 3000 : 3001;
//app.listen(port, '0.0.0.0', () => {
//  console.log('auth0-photo-server listening on ' + port + '!');
//});


module.exports = app;
