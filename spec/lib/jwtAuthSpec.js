'use strict';
require('dotenv').config();

describe('jwtAuth', function() {
  const httpMocks = require('node-mocks-http');
  const fixtures = require('pow-mongoose-fixtures');
  const db = require('../../models');
  const Agent = db.Agent;

  const jwt = require('jsonwebtoken');
  const jwtAuth = require('../../lib/jwtAuth');

  var agent, request, response;

  beforeEach(function(done) {
    agent = new Agent({ email: 'someguy@example.com', password: 'secret' });

    response = httpMocks.createResponse({
      eventEmitter: require('events').EventEmitter
    });

    done();
  });

  afterEach(function(done) {
    db.mongoose.connection.db.dropDatabase().then(function(result) {
      done();
    }).catch(function(err) {
      done.fail(err);         
    });
  });
 
  it('returns 401 and message if no token provided', done => {
    request = httpMocks.createRequest({
      method: 'POST',
      url: '/image',
      body: {}
    });

    response.on('end', function() {
      expect(response.statusCode).toEqual(401);
      expect(response._isJSON()).toBe(true);
      expect(response._getJSONData().message).toEqual('Unauthorized: No token provided');
      done();
    });

    jwtAuth(request, response, function(err) {
      done.fail('Should not get here');
    });
  });

  it('returns 401 and message if token is invalid', done => {
    request = httpMocks.createRequest({
      method: 'POST',
      url: '/image',
      body: {
        token: 'invalidtoken'
      }
    });

    response.on('end', function() {
      expect(response.statusCode).toEqual(401);
      expect(response._isJSON()).toBe(true);
      expect(response._getJSONData().message).toEqual('Unauthorized: Invalid token');
      done();
    });


    jwtAuth(request, response, function(err) {
      done.fail('Should not get here');
    });
  });

  it('attaches agent email to request object', done => {
    const token = jwt.sign({ email: agent.email }, process.env.SECRET, { expiresIn: '1h' });

    request = httpMocks.createRequest({
      method: 'POST',
      url: '/image',
      body: {
        token: token
      }
    });

    jwtAuth(request, response, function(err) {
      expect(request.user.email).toEqual(agent.email);
      expect(request.user.iat).toBeDefined();
      expect(request.user.exp).toBeDefined();
      done();
    });
  });
});
 
