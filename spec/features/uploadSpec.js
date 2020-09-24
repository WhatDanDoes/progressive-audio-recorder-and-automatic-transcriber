require('dotenv').config();
const request = require('supertest');
const fs = require('fs');
const fixtures = require('pow-mongoose-fixtures');

const app = require('../../app');
const models = require('../../models');

const mock = require('mock-fs');
const mockAndUnmock = require('../support/mockAndUnmock')(mock);

const jwt = require('jsonwebtoken');

describe('POST image/', () => {

  afterEach(function(done) {
    models.mongoose.connection.db.dropDatabase().then(function(err, result) {
      done();
    }).catch(function(err) {
      done.fail(err);         
    });
  });
 
  describe('unauthenticated access', () => {
    beforeEach(done => {
      mockAndUnmock({ 
        'uploads': mock.directory({}),
      });

      done();
    });

    afterEach(() => {
      mock.restore();
    });


    it('returns 401 error', done => {
      request(app)
        .post('/image')
        .attach('docs', 'spec/files/troll.jpg')
        .expect('Content-Type', /json/)
        .expect(401)
        .end(function(err, res) {
          if (err) {
            return done.fail(err);
          }
          expect(res.body.message).toEqual('Unauthorized: No token provided');
          done();
        });
    });

    it('does not write a file to the file system', done => {
      fs.readdir('uploads', (err, files) => {
        if (err) {
          return done.fail(err);
        }
        expect(files.length).toEqual(0);
        request(app)
          .post('/image')
          .attach('docs', 'spec/files/troll.jpg')
          .expect('Content-Type', /json/)
          .expect(401)
          .end(function(err, res) {
            if (err) {
              return done.fail(err);
            }

            fs.readdir('uploads', (err, files) => {
              if (err) {
                return done.fail(err);
              }
              expect(files.length).toEqual(0);
              done();
            });
          });
      });
    });
  });

  describe('authenticated access', () => {

    let agent, token;

    beforeEach(done => {
      fixtures.load(__dirname + '/../fixtures/agents.js', models.mongoose, function(err) {
        if (err) {
          return done.fail(err);
        }
        models.Agent.findOne({ email: 'daniel@example.com' }).then(function(results) {
          agent = results;
          token = jwt.sign({ email: agent.email }, process.env.SECRET, { expiresIn: '1h' });

          mockAndUnmock({ 
            'uploads': mock.directory({}),
          });

          done();
        }).catch(function(error) {
          done.fail(error);
        });
      });
    });

    afterEach(() => {
      mock.restore();
    });

    it('responds with 201 on successful receipt of file', done => {
      request(app)
        .post('/image')
        .set('Accept', 'application/json')
        .field('token', token)
        .attach('docs', 'spec/files/troll.jpg')
        .expect('Content-Type', /json/)
        .expect(201)
        .end(function(err, res) {
          if (err) {
            return done.fail(err);
          }
          expect(res.body.message).toEqual('Image received');
          done();
        });
    });
  
    it('writes the file to the disk on agent\'s first access', done => {
      fs.readdir(`uploads/`, (err, files) => {
        if (err) {
          return done.fail(err);
        }
        expect(files.length).toEqual(0);
 
        request(app)
          .post('/image')
          .field('token', token)
          .attach('docs', 'spec/files/troll.jpg')
          .expect(201)
          .end(function(err, res) {
            if (err) {
              return done.fail(err);
            }
            expect(res.body.message).toEqual('Image received');
    
            fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
    
              if (err) {
                return done.fail(err);
              }
              expect(files.length).toEqual(1);
    
              done();
            });
        });
      });
    });

    it('writes multiple attached files to disk', done => {
      fs.readdir(`uploads`, (err, files) => {
        if (err) {
          return done.fail(err);
        }
        expect(files.length).toEqual(0);
        request(app)
          .post('/image')
          .field('token', token)
          .attach('docs', 'spec/files/troll.jpg')
          .attach('docs', 'spec/files/troll.png')
          .expect('Content-Type', /json/)
          .expect(201)
          .end(function(err, res) {
            if (err) {
              return done.fail(err);
            }
            fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
              if (err) {
                return done.fail(err);
              }
              expect(files.length).toEqual(2);

              done();
            });
          });
        });
    });

    it('writes the file to the disk on agent\'s subsequent accesses', done => {
      fs.readdir(`uploads/`, (err, files) => {
        if (err) {
          return done.fail(err);
        }
        expect(files.length).toEqual(0);
 
        request(app)
          .post('/image')
          .field('token', token)
          .attach('docs', 'spec/files/troll.jpg')
          .expect(201)
          .end(function(err, res) {
            if (err) {
              return done.fail(err);
            }
            expect(res.body.message).toEqual('Image received');
    
            fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
    
              if (err) {
                return done.fail(err);
              }
              expect(files.length).toEqual(1);

              request(app)
                .post('/image')
                .field('token', token)
                .attach('docs', 'spec/files/troll.jpg')
                .expect(201)
                .end(function(err, res) {
                  if (err) {
                    return done.fail(err);
                  }
                  expect(res.body.message).toEqual('Image received');
          
                  fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
          
                    if (err) {
                      return done.fail(err);
                    }
                    expect(files.length).toEqual(2);
          
                    done();
                  });
                });
            });
          });
      });
    });

    it('returns a 400 error if no image is defined', done => {
      request(app)
        .post('/image')
        .field('token', token)
        .expect('Content-Type', /json/)
        .expect(400)
        .end(function(err, res) {
          if (err) {
            return done.fail(err);
          }
          expect(res.body.message).toEqual('No image provided');
          done();
        });
    });
  });
});
