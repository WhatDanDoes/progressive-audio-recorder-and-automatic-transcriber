'use strict';

describe('Agent', () => {
  const _profile = require('../fixtures/sample-auth0-profile-response');

  const db = require('../../models');
  const Agent = db.Agent;

  let agent;
  beforeEach(done => {
    agent = new Agent(_profile);
    done();
  });

  afterEach(done => {
    db.mongoose.connection.db.dropDatabase().then(result => {
      done();
    }).catch(err => {
      done.fail(err);
    });
  });

  describe('basic validation', () => {
    it('sets the createdAt and updatedAt fields', done => {
      expect(agent.createdAt).toBe(undefined);
      expect(agent.updatedAt).toBe(undefined);
      agent.save().then(obj => {
        expect(agent.createdAt instanceof Date).toBe(true);
        expect(agent.updatedAt instanceof Date).toBe(true);
        done();
      }).catch(err => {
        done.fail(err);
      });
    });

    it('does not allow two identical emails', done => {
      agent.save().then(obj => {
        Agent.create(_profile).then(obj => {
          done.fail('This should not have saved');
        }).catch(error => {
          expect(Object.keys(error.errors).length).toEqual(1);
          expect(error.errors['email'].message).toEqual('That email is already registered');
          done();
        });
      }).catch(error => {
        done.fail(error);
      });
    });

    it('does not allow an empty email field', done => {
      Agent.create({ ..._profile, email: ' ' }).then(obj => {
        done.fail('This should not have saved');
      }).catch(error => {
        expect(Object.keys(error.errors).length).toEqual(1);
        expect(error.errors['email'].message).toEqual('No email supplied');
        done();
      });
    });

    it('does not allow an undefined email field', done => {
      Agent.create({ }).then(obj => {
        done.fail('This should not have saved');
      }).catch(error => {
        expect(Object.keys(error.errors).length).toEqual(1);
        expect(error.errors['email'].message).toEqual('No email supplied');
        done();
      });
    });

    it('saves the unstructured Auth0 data', done => {
      const profile = { ..._profile, email: 'someotherguy@example.com' };
      expect(Object.keys(profile).length).toEqual(15);
      Agent.create(profile).then(obj => {
        let asserted = false;
        for (let key in profile) {
          expect(obj[key]).toEqual(profile[key]);
          asserted = true;
        }
        expect(asserted).toBe(true);
        done();
      }).catch(error => {
        done.fail(error);
      });
    });

    /**
     * canRead relationship
     */
    describe('canRead', () => {
      let newAgent;
      beforeEach(done => {
        agent.save().then(obj => {
          new Agent({ ..._profile, email: 'anotherguy@example.com' }).save().then(obj => {
            newAgent = obj;
            done();
          }).catch(err => {
            done.fail(err);
          });
        }).catch(err => {
          done.fail(err);
        });
      });

      //
      // 2020-9-29
      //
      // Going to save this for awhile, though it is probably irrelevant...
      //
      // `mongoose-unique-array` is pretty flaky. Tests pass when run as a whole,
      // but fail individually.
      //
      // Similar error popped up in production too
      //
      //it('does not add a duplicate agent to the canRead field', function(done) {
      //  agent.canRead.push(newAgent._id);
      //  agent.save().then(function(result) {
      //    expect(agent.canRead.length).toEqual(1);
      //    expect(agent.canRead[0]).toEqual(newAgent._id);
      //
      //    agent.canRead.push(newAgent._id);
      //    agent.save().then(function(result) {
      //      done.fail('This should not have updated');
      //    }).catch(err => {
      //      expect(err.message).toMatch('Duplicate values in array');
      //      done();
      //    });
      //  }).catch(err => {
      //    done.fail(err);
      //  });
      //});

      it('allows two agents to push the same agent ID', done => {
        expect (agent.canRead.length).toEqual(0);
        expect (newAgent.canRead.length).toEqual(0);

        let viewableAgent = new Agent({ ..._profile, email: 'vieweableAgent@example.com' });
        viewableAgent.save().then(result => {

          agent.canRead.push(viewableAgent._id);
          newAgent.canRead.push(viewableAgent._id);

          agent.save().then(result => {
            expect(agent.canRead.length).toEqual(1);
            expect(agent.canRead[0]).toEqual(viewableAgent._id);

            newAgent.save().then(result => {
              expect(newAgent.canRead.length).toEqual(1);
              expect(newAgent.canRead[0]).toEqual(viewableAgent._id);
              done();
            }).catch(err => {
              done.fail(err);
            });
          }).catch(err => {
            done.fail(err);
          });
        }).catch(err => {
          done.fail(err);
        });
      });
    });

    /**
     * #getReadables
     */
    describe('#getReadables', () => {
      let newAgent;
      beforeEach(done => {
        agent.save().then(obj => {
          new Agent({ ..._profile, email: 'anotherguy@example.com' }).save().then(obj => {;
            newAgent = obj;
            agent.canRead.push(newAgent._id);
            agent.save().then(result => {
              done();
            }).catch(err => {
              done.fail(err);
            });
          }).catch(err => {
            done.fail(err);
          });
        }).catch(err => {
          done.fail(err);
        });
      });

      it('retrieve an array containing accessible static directories', done => {
        agent.getReadables((err, readables) => {
          if (err) {
            return done.fail(err);
          }
          expect(readables.length).toEqual(2);
          expect(readables[0]).toEqual(newAgent.getAgentDirectory());
          expect(readables[1]).toEqual(agent.getAgentDirectory());
          done();
        });
      });
    });

    /**
     * .validPassword
     */
//    describe('.validPassword', function() {
//      beforeEach(function(done) {
//        agent.save().then(function(obj) {
//          done();
//        });
//      });
//
//      it('returns true if the password is a match', function(done) {
//        Agent.validPassword('secret', agent.password, function(err, res) {
//          expect(res).toEqual(agent);
//          done();
//        }, agent);
//      });
//
//      it('returns false if the password is not a match', function(done) {
//        Agent.validPassword('wrongsecretpassword', agent.password, function(err, res) {
//          expect(res).toBe(false);
//          done();
//        }, agent);
//      });
//    });

    /**
     * .getAgentDirectory
     */
    describe('.getAgentDirectory', () => {
      it('returns a directory path based on the agent\'s email address', () => {
        expect(agent.email).toEqual('someguy@example.com');
        expect(agent.getAgentDirectory()).toEqual('example.com/someguy');
      });
    });
  });
});
