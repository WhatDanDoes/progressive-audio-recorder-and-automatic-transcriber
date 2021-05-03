const request = require('supertest');
const fs = require('fs');
const fixtures = require('pow-mongoose-fixtures');

const app = require('../../../app');
const models = require('../../../models');

const mock = require('mock-fs');
const mockAndUnmock = require('../../support/mockAndUnmock')(mock);

const jwt = require('jsonwebtoken');

describe('track upload API', () => {

  let agent, token;

  beforeEach(done => {
    fixtures.load(__dirname + '/../../fixtures/agents.js', models.mongoose, function(err) {
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

      }).catch(error => {
        done.fail(error);
      });
    });
  });

  afterEach(done => {
    mock.restore();
    models.mongoose.connection.db.dropDatabase().then(result => {
      done();
    }).catch(err => {
      done.fail(err);
    });
  });

  describe('POST track/', () => {

    describe('unauthenticated access', () => {

      describe('audio file upload', () => {

        it('returns 401 error', done => {
          request(app)
            .post('/track')
            .set('Accept', 'application/json')
            .attach('docs', 'spec/files/troll.ogg')
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
              .post('/track')
              .set('Accept', 'application/json')
              .attach('docs', 'spec/files/troll.ogg')
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

        it('does not create a database record', done => {
          models.Track.find({}).then(tracks => {
            expect(tracks.length).toEqual(0);
            request(app)
              .post('/track')
              .set('Accept', 'application/json')
              .attach('docs', 'spec/files/troll.ogg')
              .expect('Content-Type', /json/)
              .expect(401)
              .end(function(err, res) {
                if (err) {
                  return done.fail(err);
                }

                models.Track.find({}).then(tracks => {
                  expect(tracks.length).toEqual(0);

                  done();
                }).catch(err => {
                  done.fail(err);
                });
              });
          }).catch(err => {
            done.fail(err);
          });
        });

      });

      describe('audio stream', () => {

        let audioStream;
        beforeEach(done => {
          audioStream = fs.createReadStream(`${__dirname}/../../files/troll.ogg`);
          done();
        });

        it('returns 401 error with no token provided', done => {
          let req = request(app)
            .post('/track/stream')
            .set('Accept', 'application/json')
            .set('content-type', 'application/octet-stream');

          audioStream.on('end', () => {
            req
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

          audioStream.pipe(req, {end: false});
        });

        it('returns 401 error with invalid token provided', done => {
          let req = request(app)
            .post('/track/stream')
            .set('Accept', 'application/json')
            .set('x-access-token', 'junk-token')
            .set('content-type', 'application/octet-stream');

          audioStream.on('end', () => {
            req
              .expect('Content-Type', /json/)
              .expect(401)
              .end(function(err, res) {
                if (err) {
                  return done.fail(err);
                }
                expect(res.body.message).toEqual('Unauthorized: Invalid token');
                done();
              });
          });

          audioStream.pipe(req, {end: false});
        });


        it('does not write a file to the file system', done => {
          fs.readdir('uploads', (err, files) => {
            if (err) {
              return done.fail(err);
            }
            expect(files.length).toEqual(0);

            let req = request(app)
              .post('/track/stream')
              .set('Accept', 'application/json')
              .set('content-type', 'application/octet-stream');

            audioStream.on('end', () => {
              req
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

            audioStream.pipe(req, {end: false});
          });
        });

        it('does not create a database record', done => {
          models.Track.find({}).then(tracks => {
            expect(tracks.length).toEqual(0);
            let req = request(app)
              .post('/track/stream')
              .set('Accept', 'application/json')
              .set('content-type', 'application/octet-stream');

            audioStream.on('end', () => {
              req
                .expect('Content-Type', /json/)
                .expect(401)
                .end(function(err, res) {
                  if (err) {
                    return done.fail(err);
                  }

                  models.Track.find({}).then(tracks => {
                    expect(tracks.length).toEqual(0);

                    done();
                  }).catch(err => {
                    done.fail(err);
                  });
                });
            });

            audioStream.pipe(req, {end: false});
          }).catch(err => {
            done.fail(err);
          });
        });
      });
    });

    describe('authenticated access', () => {
      describe('audio file upload', () => {
        it('responds with 201 on successful receipt of file', done => {
          request(app)
            .post('/track')
            .set('Accept', 'application/json')
            .field('token', token)
            .attach('docs', 'spec/files/troll.ogg')
            .expect('Content-Type', /json/)
            .expect(201)
            .end(function(err, res) {
              if (err) {
                return done.fail(err);
              }
              expect(res.body.message).toEqual('Track received');
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
              .post('/track')
              .set('Accept', 'application/json')
              .field('token', token)
              .attach('docs', 'spec/files/troll.ogg')
              .expect(201)
              .end(function(err, res) {
                if (err) {
                  return done.fail(err);
                }
                expect(res.body.message).toEqual('Track received');

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
              .post('/track')
              .set('Accept', 'application/json')
              .field('token', token)
              .attach('docs', 'spec/files/troll.ogg')
              .attach('docs', 'spec/files/troll.wav')
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
              .post('/track')
              .set('Accept', 'application/json')
              .field('token', token)
              .attach('docs', 'spec/files/troll.ogg')
              .expect(201)
              .end(function(err, res) {
                if (err) {
                  return done.fail(err);
                }
                expect(res.body.message).toEqual('Track received');

                fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {

                  if (err) {
                    return done.fail(err);
                  }
                  expect(files.length).toEqual(1);

                  request(app)
                    .post('/track')
                    .set('Accept', 'application/json')
                    .field('token', token)
                    .attach('docs', 'spec/files/troll.ogg')
                    .expect(201)
                    .end(function(err, res) {
                      if (err) {
                        return done.fail(err);
                      }
                      expect(res.body.message).toEqual('Track received');

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

        it('creates a database record', done => {
          models.Track.find({}).then(tracks => {
            expect(tracks.length).toEqual(0);
            request(app)
              .post('/track')
              .set('Accept', 'application/json')
              .field('token', token)
              .attach('docs', 'spec/files/troll.ogg')
              .expect(201)
              .end(function(err, res) {
                if (err) {
                  return done.fail(err);
                }

                models.Track.find({}).then(tracks => {
                  expect(tracks.length).toEqual(1);
                  expect(tracks[0].path).toMatch(`uploads/${agent.getAgentDirectory()}/`);

                  done();
                }).catch(err => {
                  done.fail(err);
                });
              });
          }).catch(err => {
            done.fail(err);
          });
        });

        it('writes a database record for each attached file', done => {
          models.Track.find({}).then(tracks => {
            expect(tracks.length).toEqual(0);

            request(app)
              .post('/track')
              .set('Accept', 'application/json')
              .field('token', token)
              .attach('docs', 'spec/files/troll.ogg')
              .attach('docs', 'spec/files/troll.wav')
              .expect('Content-Type', /json/)
              .expect(201)
              .end(function(err, res) {
                if (err) {
                  return done.fail(err);
                }
                models.Track.find({}).then(tracks => {
                  expect(tracks.length).toEqual(2);
                  expect(tracks[0].path).toMatch(`uploads/${agent.getAgentDirectory()}/`);
                  expect(tracks[1].path).toMatch(`uploads/${agent.getAgentDirectory()}/`);

                  done();
                }).catch(err => {
                  done.fail(err);
                });
              });
          }).catch(err => {
            done.fail(err);
          });
        });

        it('returns a 400 error if no track is defined', done => {
          request(app)
            .post('/track')
            .set('Accept', 'application/json')
            .field('token', token)
            .expect('Content-Type', /json/)
            .expect(400)
            .end(function(err, res) {
              if (err) {
                return done.fail(err);
              }
              expect(res.body.message).toEqual('No track provided');
              done();
            });
        });

        it('uses the blob type to determine file extension', done => {
          fs.readdir('uploads', (err, files) => {
            if (err) {
              return done.fail(err);
            }
            expect(files.length).toEqual(0);

            request(app)
              .post('/track')
              .set('Accept', 'application/json')
              .field('token', token)
              .attach('docs', 'spec/files/troll.ogg', { contentType: 'text/plain' })
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
                  expect(files.length).toEqual(1);
                  expect(files[0].split('.')[1]).toEqual('txt');
                  done();
                });
              });
          });
        });
      });

      describe('audio stream', () => {

        let audioStream;
        beforeEach(done => {
          audioStream = fs.createReadStream(`${__dirname}/../../files/troll.ogg`);
          done();
        });

        it('responds with 201 on successful closing of stream', done => {
          let req = request(app)
            .post('/track/stream')
            .set('Accept', 'application/json')
            .set('x-access-token', token)
            .set('content-type', 'application/octet-stream');

          audioStream.on('end', () => {
            req
              .expect('Content-Type', /json/)
              .expect(201)
              .end(function(err, res) {
                if (err) {
                  return done.fail(err);
                }
                expect(res.body.message).toEqual('Track received');
                done();
              });
          });

          audioStream.pipe(req, {end: false});
        });

        it('writes the file to the disk on agent\'s first access', done => {
          fs.readdir(`uploads/`, (err, files) => {
            if (err) {
              return done.fail(err);
            }
            expect(files.length).toEqual(0);

            let req = request(app)
              .post('/track/stream')
              .set('Accept', 'application/json')
              .set('x-access-token', token)
              .set('content-type', 'application/octet-stream');

            audioStream.on('end', () => {
              req
                .expect(201)
                .end(function(err, res) {
                  if (err) {
                    return done.fail(err);
                  }
                  expect(res.body.message).toEqual('Track received');

                  fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
                    if (err) return done.fail(err);

                    expect(files.length).toEqual(1);

                    done();
                  });
              });
            });

            audioStream.pipe(req, {end: false});
          });
        });

        it('creates a database record', done => {
          models.Track.find({}).then(tracks => {
            expect(tracks.length).toEqual(0);

            let req = request(app)
              .post('/track/stream')
              .set('Accept', 'application/json')
              .set('x-access-token', token)
              .set('content-type', 'application/octet-stream');

            audioStream.on('end', () => {
              req
                .expect(201)
                .end(function(err, res) {
                  if (err) return done.fail(err);

                  models.Track.find({}).then(tracks => {
                    expect(tracks.length).toEqual(1);
                    expect(tracks[0].path).toMatch(`uploads/${agent.getAgentDirectory()}/`);

                    done();
                  }).catch(err => {
                    done.fail(err);
                  });
                });
            });

            audioStream.pipe(req, {end: false});
          }).catch(err => {
            done.fail(err);
          });
        });
      });
    });
  });
});
