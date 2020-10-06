'use strict';

const fixtures = require('pow-mongoose-fixtures');
const models = require('../../models');

const app = require('../../app');
const request = require('supertest');

const fs = require('fs');
const mkdirp = require('mkdirp');

const Browser = require('zombie');
const PORT = process.env.NODE_ENV === 'production' ? 3000 : 3001;
const DOMAIN = 'example.com';
Browser.localhost(DOMAIN, PORT);

const stubAuth0Sessions = require('../support/stubAuth0Sessions');

/**
 * `mock-fs` stubs the entire file system. So if a module hasn't
 * already been `require`d the tests will fail because the
 * module doesn't exist in the mocked file system. `ejs` and
 * `iconv-lite/encodings` are required here to solve that
 * problem.
 */
const mock = require('mock-fs');
const mockAndUnmock = require('../support/mockAndUnmock')(mock);


// For when system resources are scarce
jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;

describe('Publishing an image', () => {

  let browser, agent, lanny;

  beforeEach(done => {
    browser = new Browser({ waitDuration: '30s', loadCss: false });
    //browser.debug();
    fixtures.load(__dirname + '/../fixtures/agents.js', models.mongoose, err => {
      models.Agent.findOne({ email: 'daniel@example.com' }).then(results => {
        agent = results;
        models.Agent.findOne({ email: 'lanny@example.com' }).then(results => {
          lanny = results;
          browser.visit('/', err => {
            if (err) return done.fail(err);
            browser.assert.success();
            done();
          });
        }).catch(error => {
          done.fail(error);
        });
      }).catch(error => {
        done.fail(error);
      });
    });
  });

  afterEach(done => {
    models.mongoose.connection.db.dropDatabase().then((err, result) => {
      done();
    }).catch(err => {
      done.fail(err);
    });
  });


  describe('from show view', () => {

    describe('unauthenticated', () => {
      it('does not allow publishing an image', done => {
        request(app)
          .post(`/image/${agent.getAgentDirectory()}/image2.jpg`)
          .end((err, res) => {
            if (err) return done.fail(err);
            expect(res.status).toEqual(302);
            expect(res.header.location).toEqual('/');
            done();
          });
      });
    });

    describe('authenticated', () => {
      beforeEach(done => {
        stubAuth0Sessions(agent.email, DOMAIN, err => {
          if (err) done.fail(err);

          mockAndUnmock({
            [`uploads/${agent.getAgentDirectory()}`]: {
              'image1.jpg': fs.readFileSync('spec/files/troll.jpg'),
              'image2.jpg': fs.readFileSync('spec/files/troll.jpg'),
              'image3.jpg': fs.readFileSync('spec/files/troll.jpg'),
            },
            [`uploads/${lanny.getAgentDirectory()}`]: {
              'lanny1.jpg': fs.readFileSync('spec/files/troll.jpg'),
              'lanny2.jpg': fs.readFileSync('spec/files/troll.jpg'),
              'lanny3.jpg': fs.readFileSync('spec/files/troll.jpg'),
            },
            'public/images/uploads': {}
          });

          const images = [
            { path: `uploads/${agent.getAgentDirectory()}/image1.jpg`, photographer: agent._id },
            { path: `uploads/${agent.getAgentDirectory()}/image2.jpg`, photographer: agent._id },
            { path: `uploads/${agent.getAgentDirectory()}/image3.jpg`, photographer: agent._id },
            { path: `uploads/${lanny.getAgentDirectory()}/lanny1.jpg`, photographer: lanny._id },
            { path: `uploads/${lanny.getAgentDirectory()}/lanny2.jpg`, photographer: lanny._id },
            { path: `uploads/${lanny.getAgentDirectory()}/lanny3.jpg`, photographer: lanny._id },
          ];
          models.Image.create(images).then(results => {

            browser.clickLink('Login', err => {
              if (err) done.fail(err);
              browser.assert.success();
              done();
            });
          }).catch(err => {
            done.fail(err);
          });
        });
      });

      afterEach(() => {
        mock.restore();
      });

      it('renders a form to allow an agent to delete an image', done => {
        browser.clickLink(`a[href="/image/${agent.getAgentDirectory()}/image1.jpg"]`, err => {
          if (err) return done.fail(err);
          browser.assert.success();
          browser.assert.element('#publish-image-form');
          browser.assert.element(`form[action="/image/${agent.getAgentDirectory()}/image1.jpg"][method="post"]`);
          done();
        });
      });

      describe('publishing', () => {
        describe('owner resource', () => {
          beforeEach(done => {
            browser.clickLink(`a[href="/image/${agent.getAgentDirectory()}/image1.jpg"]`, err => {
              if (err) return done.fail(err);
              browser.assert.success();
              done();
            });
          });

          it('redirects to home if the publish is successful', done => {
            browser.pressButton('Publish', err => {
              if (err) return done.fail(err);

              browser.assert.success();
              browser.assert.text('.alert.alert-success', 'Image published');
              browser.assert.url({ pathname: '/' });
              done();
            });
          });

          it('deletes the image from the agent\'s directory', done => {
            fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
              if (err) return done.fail(err);
              expect(files.length).toEqual(3);
              expect(files.includes('image1.jpg')).toBe(true);

              browser.pressButton('Publish', function(err) {
                if (err) return done.fail(err);
                browser.assert.success();

                fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
                  if (err) return done.fail(err);
                  expect(files.length).toEqual(2);
                  expect(files.includes('image1.jpg')).toBe(false);

                  done();
                });
              });
            });
          });

          it('adds the image to the public/images/uploads directory', function(done) {
            fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
              if (err) return done.fail(err);
              expect(files.length).toEqual(3);
              expect(files.includes('image1.jpg')).toBe(true);

              browser.pressButton('Publish', function(err) {
                if (err) return done.fail(err);
                browser.assert.success();

                fs.readdir(`public/images/uploads`, (err, files) => {
                  if (err) return done.fail(err);
                  expect(files.length).toEqual(1);
                  expect(files.includes('image1.jpg')).toBe(true);

                  done();
                });
              });
            });
          });

          it('points the database path to the public/images/uploads directory', done => {
            models.Image.find({ path: `public/images/uploads/image1.jpg`}).then(images => {
              expect(images.length).toEqual(0);

              models.Image.find({ path: `uploads/${agent.getAgentDirectory()}/image1.jpg`}).then(images => {
                expect(images.length).toEqual(1);
                expect(images[0].published).toBe(false);

                browser.pressButton('Publish', err => {
                  if (err) return done.fail(err);
                  browser.assert.success();

                  models.Image.find({ path: `uploads/${agent.getAgentDirectory()}/image1.jpg`}).then(images => {
                    expect(images.length).toEqual(0);

                    models.Image.find({ path: `public/images/uploads/image1.jpg`}).then(images => {
                      expect(images.length).toEqual(1);
                      expect(images[0].published).toBe(true);

                      done();
                    }).catch(err => {
                      done.fail(err);
                    });
                  }).catch(err => {
                    done.fail(err);
                  });
                });
              }).catch(err => {
                done.fail(err);
              });
            }).catch(err => {
              done.fail(err);
            });
          });
        });

        describe('readable resource', () => {
          beforeEach(done => {
            browser.visit(`/image/${lanny.getAgentDirectory()}/image1.jpg`, (err) => {
              if (err) return done.fail(err);
              browser.assert.success();
              done();
            });
          });

          it('does not show a publish button', () => {
            browser.assert.elements('#publish-image-form', 0);
          });

          it('does not remove the image from the agent\'s directory', done => {
            fs.readdir(`uploads/${lanny.getAgentDirectory()}`, (err, files) => {
              if (err) return done.fail(err);
              expect(files.length).toEqual(3);
              expect(files.includes('lanny1.jpg')).toBe(true);

              request(app)
                .post(`/image/${lanny.getAgentDirectory()}/lanny1.jpg`)
                .set('Cookie', browser.cookies)
                .end((err, res) => {
                  if (err) return done.fail(err);
                  expect(res.status).toEqual(302);
                  expect(res.header.location).toEqual(`/image/${lanny.getAgentDirectory()}`);

                  fs.readdir(`uploads/${lanny.getAgentDirectory()}`, (err, files) => {
                    if (err) return done.fail(err);
                    expect(files.length).toEqual(3);
                    expect(files.includes('lanny1.jpg')).toBe(true);

                    fs.readdir(`public/images/uploads`, (err, files) => {
                      if (err) return done.fail(err);
                      expect(files.length).toEqual(0);
                      expect(files.includes('image1.jpg')).toBe(false);

                      done();
                    });
                  });
                });
            });
          });

          it('does not modify the database record\'s path property', done => {
            models.Image.find({ path: `public/images/uploads/lanny1.jpg`}).then(images => {
              expect(images.length).toEqual(0);

              models.Image.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.jpg`}).then(images => {
                expect(images.length).toEqual(1);
                expect(images[0].published).toBe(false);

                request(app)
                  .post(`/image/${lanny.getAgentDirectory()}/lanny1.jpg`)
                  .set('Cookie', browser.cookies)
                  .expect(302)
                  .end((err, res) => {
                    if (err) return done.fail(err);

                    models.Image.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.jpg`}).then(images => {
                      expect(images.length).toEqual(1);
                      expect(images[0].published).toBe(false);

                      models.Image.find({ path: `public/images/uploads/lanny1.jpg`}).then(images => {
                        expect(images.length).toEqual(0);

                        done();
                      }).catch(err => {
                        done.fail(err);
                      });
                    }).catch(err => {
                      done.fail(err);
                    });
                });
              }).catch(err => {
                done.fail(err);
              });
            }).catch(err => {
              done.fail(err);
            });
          });
        });

        describe('unauthorized resource', function() {
          let troy;
          beforeEach(function(done) {
            models.Agent.findOne({ email: 'troy@example.com' }).then(function(result) {
              troy = result;

              expect(agent.canRead.length).toEqual(1);
              expect(agent.canRead[0]).not.toEqual(troy._id);

              mkdirp(`uploads/${troy.getAgentDirectory()}`, (err) => {
                fs.writeFileSync(`uploads/${troy.getAgentDirectory()}/troy1.jpg`, fs.readFileSync('spec/files/troll.jpg'));

                const images = [
                  { path: `uploads/${troy.getAgentDirectory()}/troy1.jpg`, photographer: troy._id },
                ];
                models.Image.create(images).then(results => {

                  browser.visit(`/image/${troy.getAgentDirectory()}/troy1.jpg`, function(err) {
                    if (err) return done.fail(err);
                    done();
                  });
                }).catch(err => {
                  done.fail(err);
                });
              });
            }).catch(function(error) {
              done.fail(error);
            });
          });

          it('redirects home', () => {
            browser.assert.redirected();
            browser.assert.url({ pathname: '/'});
            browser.assert.text('.alert.alert-danger', 'You are not authorized to access that resource');
          });

          it('does not touch the image on the file system', function(done) {
            fs.readdir(`uploads/${troy.getAgentDirectory()}`, (err, files) => {
              if (err) return done.fail(err);
              expect(files.length).toEqual(1);
              expect(files.includes('troy1.jpg')).toBe(true);

              request(app)
                .post(`/image/${troy.getAgentDirectory()}/troy1.jpg`)
                .set('Cookie', browser.cookies)
                .end(function(err, res) {
                  if (err) return done.fail(err);
                  expect(res.status).toEqual(302);
                  expect(res.header.location).toEqual('/');

                  fs.readdir(`uploads/${troy.getAgentDirectory()}`, (err, files) => {
                    if (err) return done.fail(err);
                    expect(files.length).toEqual(1);
                    expect(files.includes('troy1.jpg')).toBe(true);

                    fs.readdir(`public/images/uploads`, (err, files) => {
                      if (err) return done.fail(err);
                      expect(files.length).toEqual(0);
                      expect(files.includes('troy1.jpg')).toBe(false);

                      done();
                    });
                  });
                });
            });
          });

          it('does not modify the database record\'s path property', done => {
            models.Image.find({ path: `public/images/uploads/troy1.jpg`}).then(images => {
              expect(images.length).toEqual(0);

              models.Image.find({ path: `uploads/${troy.getAgentDirectory()}/troy1.jpg`}).then(images => {
                expect(images.length).toEqual(1);
                expect(images[0].published).toBe(false);

                request(app)
                  .post(`/image/${troy.getAgentDirectory()}/troy1.jpg`)
                  .set('Cookie', browser.cookies)
                  .expect(302)
                  .end(function(err, res) {
                    if (err) return done.fail(err);

                    models.Image.find({ path: `uploads/${troy.getAgentDirectory()}/troy1.jpg`}).then(images => {
                      expect(images.length).toEqual(1);
                      expect(images[0].published).toBe(false);

                      models.Image.find({ path: `public/images/uploads/troy1.jpg`}).then(images => {
                        expect(images.length).toEqual(0);

                        done();
                      }).catch(err => {
                        done.fail(err);
                      });
                    }).catch(err => {
                      done.fail(err);
                    });
                });
              }).catch(err => {
                done.fail(err);
              });
            }).catch(err => {
              done.fail(err);
            });
          });
        });

        describe('sudo mode', () => {

          afterEach(() => {
            delete process.env.SUDO;
          });

          describe('set', () => {
            describe('non sudo agent', () => {

              beforeEach(() => {
                process.env.SUDO = 'lanny@example.com';
                expect(process.env.SUDO).not.toEqual(agent.email);
              });

              it('doesn\'t render the Publish button', done => {
                browser.clickLink(`a[href="/image/${agent.getAgentDirectory()}/image1.jpg"]`, (err) => {
                  if (err) return done.fail(err);

                  browser.assert.success();
                  browser.assert.elements('#publish-image-form', 0);
                  done();
                });
              });

              it('redirects to the original directory', done => {
                request(app)
                  .post(`/image/${agent.getAgentDirectory()}/image2.jpg`)
                  .set('Cookie', browser.cookies)
                  .expect(302)
                  .end((err, res) => {
                    if (err) return done.fail(err);

                    expect(res.header.location).toEqual(`/image/${agent.getAgentDirectory()}/image2.jpg`);
                    done();
                  });
              });

              it('does not modify the database record\'s path property', done => {
                models.Image.find({ path: `public/images/uploads/image2.jpg`}).then(images => {
                  expect(images.length).toEqual(0);

                  models.Image.find({ path: `uploads/${agent.getAgentDirectory()}/image2.jpg`}).then(images => {
                    expect(images.length).toEqual(1);
                    expect(images[0].published).toBe(false);

                    request(app)
                      .post(`/image/${agent.getAgentDirectory()}/image2.jpg`)
                      .set('Cookie', browser.cookies)
                      .expect(302)
                      .end(function(err, res) {
                        if (err) return done.fail(err);

                        models.Image.find({ path: `uploads/${agent.getAgentDirectory()}/image2.jpg`}).then(images => {
                          expect(images.length).toEqual(1);
                          expect(images[0].published).toBe(false);

                          models.Image.find({ path: `public/images/uploads/image2.jpg`}).then(images => {
                            expect(images.length).toEqual(0);

                            done();
                          }).catch(err => {
                            done.fail(err);
                          });
                        }).catch(err => {
                          done.fail(err);
                        });
                    });
                  }).catch(err => {
                    done.fail(err);
                  });
                }).catch(err => {
                  done.fail(err);
                });
              });
            });

            describe('sudo agent', () => {

              beforeEach(done => {
                process.env.SUDO = agent.email;
                browser.visit(`/image/${lanny.getAgentDirectory()}/lanny1.jpg`, (err) => {
                  if (err) return done.fail(err);
                  browser.assert.success();
                  browser.assert.url({ pathname: `/image/${lanny.getAgentDirectory()}/lanny1.jpg` });
                  done();
                });
              });

              it('renders the Publish button', () => {
                browser.assert.element('#publish-image-form');
              });

              it('redirects home (i.e., the main photo roll)', done => {
                browser.assert.url({ pathname: `/image/${lanny.getAgentDirectory()}/lanny1.jpg` });
                browser.pressButton('Publish', err => {
                  if (err) return done.fail(err);
                  browser.assert.success();

                  browser.assert.url({ pathname: '/' });
                  done();
                });
              });

              it('points the database path to the public/images/uploads directory', done => {
                models.Image.find({ path: `public/images/uploads/lanny1.jpg`}).then(images => {
                  expect(images.length).toEqual(0);

                  models.Image.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.jpg`}).then(images => {
                    expect(images.length).toEqual(1);
                    expect(images[0].published).toBe(false);

                    browser.pressButton('Publish', err => {
                      if (err) return done.fail(err);
                      browser.assert.success();

                      models.Image.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.jpg`}).then(images => {
                        expect(images.length).toEqual(0);

                        models.Image.find({ path: `public/images/uploads/lanny1.jpg`}).then(images => {
                          expect(images.length).toEqual(1);
                          expect(images[0].published).toBe(true);

                          done();
                        }).catch(err => {
                          done.fail(err);
                        });
                      }).catch(err => {
                        done.fail(err);
                      });
                    });
                  }).catch(err => {
                    done.fail(err);
                  });
                }).catch(err => {
                  done.fail(err);
                });
              });
            });
          });
        });
      });
    });
  });

  describe('from index view', () => {

    describe('authenticated', () => {
      beforeEach(done => {
        stubAuth0Sessions(agent.email, DOMAIN, err => {
          if (err) done.fail(err);

          mockAndUnmock({
            [`uploads/${agent.getAgentDirectory()}`]: {
              'image1.jpg': fs.readFileSync('spec/files/troll.jpg'),
              'image2.jpg': fs.readFileSync('spec/files/troll.jpg'),
              'image3.jpg': fs.readFileSync('spec/files/troll.jpg'),
            },
            [`uploads/${lanny.getAgentDirectory()}`]: {
              'lanny1.jpg': fs.readFileSync('spec/files/troll.jpg'),
              'lanny2.jpg': fs.readFileSync('spec/files/troll.jpg'),
              'lanny3.jpg': fs.readFileSync('spec/files/troll.jpg'),
            },
            'public/images/uploads': {}
          });

          const images = [
            { path: `uploads/${agent.getAgentDirectory()}/image1.jpg`, photographer: agent._id },
            { path: `uploads/${agent.getAgentDirectory()}/image2.jpg`, photographer: agent._id },
            { path: `uploads/${agent.getAgentDirectory()}/image3.jpg`, photographer: agent._id },
            { path: `uploads/${lanny.getAgentDirectory()}/lanny1.jpg`, photographer: lanny._id },
            { path: `uploads/${lanny.getAgentDirectory()}/lanny2.jpg`, photographer: lanny._id },
            { path: `uploads/${lanny.getAgentDirectory()}/lanny3.jpg`, photographer: lanny._id },
          ];
          models.Image.create(images).then(results => {

            browser.clickLink('Login', err => {
              if (err) done.fail(err);
              browser.assert.success();
              browser.assert.url({ pathname: `/image/${agent.getAgentDirectory()}` });
              done();
            });
          }).catch(err => {
            done.fail(err);
          });
        });
      });

      afterEach(() => {
        mock.restore();
      });

      it('renders forms to allow an agent to delete an image', () => {
        browser.assert.elements('.publish-image-form', 3);
        browser.assert.element(`form[action="/image/${agent.getAgentDirectory()}/image1.jpg"][method="post"]`);
        browser.assert.element(`form[action="/image/${agent.getAgentDirectory()}/image2.jpg"][method="post"]`);
        browser.assert.element(`form[action="/image/${agent.getAgentDirectory()}/image3.jpg"][method="post"]`);
      });

      describe('publishing', () => {
        describe('owner resource', () => {
          beforeEach(() => {
            browser.assert.elements('#publish-image-form', 0);
            browser.assert.elements('.publish-image-form', 3);
          });

          it('redirects to home if the publish is successful', done => {
            //
            // Careful here... this is pressing the first button. There are three Publish buttons
            //
            // If this flakes out somehow, remember this:
            //   browser.document.forms[0].submit();
            //
            // 2020-10-2 https://stackoverflow.com/a/40264336/1356582
            //

            browser.pressButton('Publish', err => {
              if (err) return done.fail(err);

              browser.assert.success();
              browser.assert.text('.alert.alert-success', 'Image published');
              browser.assert.url({ pathname: '/' });
              done();
            });
          });

          it('deletes the image from the agent\'s directory', function(done) {
            fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
              if (err) return done.fail(err);
              expect(files.length).toEqual(3);
              expect(files.includes('image1.jpg')).toBe(true);

              // Cf., Publish notes above
              browser.pressButton('Publish', function(err) {
                if (err) return done.fail(err);
                browser.assert.success();

                fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
                  if (err) return done.fail(err);
                  expect(files.length).toEqual(2);
                  expect(files.includes('image3.jpg')).toBe(false);

                  done();
                });
              });
            });
          });

          it('adds the image to the public/images/uploads directory', function(done) {
            fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
              if (err) return done.fail(err);
              expect(files.length).toEqual(3);
              expect(files.includes('image1.jpg')).toBe(true);
              expect(files.includes('image2.jpg')).toBe(true);
              expect(files.includes('image3.jpg')).toBe(true);

              // Cf., Publish notes above
              browser.pressButton('Publish', function(err) {
                if (err) return done.fail(err);
                browser.assert.success();

                fs.readdir(`public/images/uploads`, (err, files) => {
                  if (err) return done.fail(err);
                  expect(files.length).toEqual(1);
                  expect(files.includes('image1.jpg')).toBe(false);
                  expect(files.includes('image2.jpg')).toBe(false);
                  expect(files.includes('image3.jpg')).toBe(true);

                  done();
                });
              });
            });
          });

          it('points the database path to the public/images/uploads directory', done => {
            models.Image.find({ path: `public/images/uploads/image3.jpg`}).then(images => {
              expect(images.length).toEqual(0);

              models.Image.find({ path: `uploads/${agent.getAgentDirectory()}/image3.jpg`}).then(images => {
                expect(images.length).toEqual(1);
                expect(images[0].published).toBe(false);

                browser.pressButton('Publish', err => {
                  if (err) return done.fail(err);
                  browser.assert.success();

                  models.Image.find({ path: `uploads/${agent.getAgentDirectory()}/image3.jpg`}).then(images => {
                    expect(images.length).toEqual(0);

                    models.Image.find({ path: `public/images/uploads/image3.jpg`}).then(images => {
                      expect(images.length).toEqual(1);
                      expect(images[0].published).toBe(true);

                      done();
                    }).catch(err => {
                      done.fail(err);
                    });
                  }).catch(err => {
                    done.fail(err);
                  });
                });
              }).catch(err => {
                done.fail(err);
              });
            }).catch(err => {
              done.fail(err);
            });
          });
        });

        describe('readable resource', () => {
          beforeEach(done => {
            browser.visit(`/image/${lanny.getAgentDirectory()}`, (err) => {
              if (err) return done.fail(err);
              browser.assert.success();
              done();
            });
          });

          it('does not show a publish button', () => {
            browser.assert.elements('#publish-image-form', 0);
            browser.assert.elements('.publish-image-form', 0);
          });

          it('does not remove the image from the agent\'s directory', function(done) {
            fs.readdir(`uploads/${lanny.getAgentDirectory()}`, (err, files) => {
              if (err) return done.fail(err);
              expect(files.length).toEqual(3);
              expect(files.includes('lanny1.jpg')).toBe(true);
              expect(files.includes('lanny2.jpg')).toBe(true);
              expect(files.includes('lanny3.jpg')).toBe(true);

              request(app)
                .post(`/image/${lanny.getAgentDirectory()}/lanny1.jpg`)
                .set('Cookie', browser.cookies)
                .end(function(err, res) {
                  if (err) return done.fail(err);
                  expect(res.status).toEqual(302);
                  expect(res.header.location).toEqual(`/image/${lanny.getAgentDirectory()}`);

                  fs.readdir(`uploads/${lanny.getAgentDirectory()}`, (err, files) => {
                    if (err) return done.fail(err);
                    expect(files.length).toEqual(3);
                    expect(files.includes('lanny1.jpg')).toBe(true);
                    expect(files.includes('lanny2.jpg')).toBe(true);
                    expect(files.includes('lanny3.jpg')).toBe(true);

                    fs.readdir(`public/images/uploads`, (err, files) => {
                      if (err) return done.fail(err);
                      expect(files.length).toEqual(0);
                      expect(files.includes('image1.jpg')).toBe(false);
                      expect(files.includes('image2.jpg')).toBe(false);
                      expect(files.includes('image3.jpg')).toBe(false);

                      done();
                    });
                  });
                });
            });
          });

          it('does not modify the database record\'s path property', done => {
            models.Image.find({ path: `public/images/uploads/lanny1.jpg`}).then(images => {
              expect(images.length).toEqual(0);

              models.Image.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.jpg`}).then(images => {
                expect(images.length).toEqual(1);
                expect(images[0].published).toBe(false);

                request(app)
                  .post(`/image/${lanny.getAgentDirectory()}/lanny1.jpg`)
                  .set('Cookie', browser.cookies)
                  .expect(302)
                  .end(function(err, res) {
                    if (err) return done.fail(err);

                    models.Image.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.jpg`}).then(images => {
                      expect(images.length).toEqual(1);
                      expect(images[0].published).toBe(false);

                      models.Image.find({ path: `public/images/uploads/lanny1.jpg`}).then(images => {
                        expect(images.length).toEqual(0);

                        done();
                      }).catch(err => {
                        done.fail(err);
                      });
                    }).catch(err => {
                      done.fail(err);
                    });
                });
              }).catch(err => {
                done.fail(err);
              });
            }).catch(err => {
              done.fail(err);
            });
          });
        });

        describe('sudo mode', () => {

          afterEach(() => {
            delete process.env.SUDO;
          });

          describe('set', () => {
            describe('non sudo agent', () => {

              beforeEach(() => {
                process.env.SUDO = 'lanny@example.com';
                expect(process.env.SUDO).not.toEqual(agent.email);
              });

              it('doesn\'t render the Publish buttons', done => {
                browser.visit(`/image/${agent.getAgentDirectory()}`, (err) => {
                  browser.assert.url({ pathname: `/image/${agent.getAgentDirectory()}` });
                  browser.assert.elements('#publish-image-form', 0);
                  browser.assert.elements('.publish-image-form', 0);
                  done();
                });
              });
            });

            describe('sudo agent', () => {

              beforeEach(done => {
                process.env.SUDO = agent.email;
                browser.visit(`/image/${lanny.getAgentDirectory()}`, err => {
                  if (err) return done.fail(err);
                  browser.assert.success();
                  browser.assert.url({ pathname: `/image/${lanny.getAgentDirectory()}` });
                  done();
                });
              });

              it('renders the Publish button', () => {
                browser.assert.success();
                browser.assert.elements('#publish-image-form', 0);
                browser.assert.elements('.publish-image-form', 3);
              });

              it('points the database path to the public/images/uploads directory', done => {
                models.Image.find({ path: `public/images/uploads/lanny3.jpg`}).then(images => {
                  expect(images.length).toEqual(0);

                  models.Image.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny3.jpg`}).then(images => {
                    expect(images.length).toEqual(1);
                    expect(images[0].published).toBe(false);

                    browser.pressButton('Publish', err => {
                      if (err) return done.fail(err);
                      browser.assert.success();

                      models.Image.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny3.jpg`}).then(images => {
                        expect(images.length).toEqual(0);

                        models.Image.find({ path: `public/images/uploads/lanny3.jpg`}).then(images => {
                          expect(images.length).toEqual(1);
                          expect(images[0].published).toBe(true);

                          done();
                        }).catch(err => {
                          done.fail(err);
                        });
                      }).catch(err => {
                        done.fail(err);
                      });
                    });
                  }).catch(err => {
                    done.fail(err);
                  });
                }).catch(err => {
                  done.fail(err);
                });
              });
            });
          });
        });
      });
    });
  });
});
