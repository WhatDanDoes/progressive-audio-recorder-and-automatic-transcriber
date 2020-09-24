'use strict';

describe('Agent', function() {
  const db = require('../../models');
  const Agent = db.Agent;

  let agent;

  beforeEach(function(done) {
    agent = new Agent({ email: 'someguy@example.com', password: 'secret' });
    done();
  });

  afterEach(function(done) {
    db.mongoose.connection.db.dropDatabase().then(function(result) {
      done();
    }).catch(function(err) {
      done.fail(err);         
    });
  });
 
  describe('basic validation', function() {
    it('sets the createdAt and updatedAt fields', function(done) {
      expect(agent.createdAt).toBe(undefined);
      expect(agent.updatedAt).toBe(undefined);
      agent.save().then(function(obj) {
        expect(agent.createdAt instanceof Date).toBe(true);
        expect(agent.updatedAt instanceof Date).toBe(true);
        done();
      }).catch(err => {
        done.fail(err);
      });
    });
  
    it("encrypts the agent's password", function(done) {
      expect(agent.password).toEqual('secret');
      agent.save().then(function(obj) {
        Agent.findById(obj._id).then(function(results) {
          expect(results.password).not.toEqual('secret');
          done();
        }).catch(err => {
          done.fail(err);
        });
      }).catch(err => {
        done.fail(err);
      });
    });

    it('does not allow two identical emails', function(done) {
      agent.save().then(function(obj) {
        Agent.create({ email: 'someguy@example.com', password: 'secret' }).then(function(obj) {
          done.fail('This should not have saved');
        }).catch(function(error) {
          expect(Object.keys(error.errors).length).toEqual(1);
          expect(error.errors['email'].message).toEqual('That email is already registered');
          done();
        });
      }).catch(function(error) {
        done.fail(error);
      });
    });

    it('does not allow an empty email field', function(done) {
      Agent.create({ email: ' ', password: 'secret' }).then(function(obj) {
        done.fail('This should not have saved');
      }).catch(function(error) {
        expect(Object.keys(error.errors).length).toEqual(1);
        expect(error.errors['email'].message).toEqual('No email supplied');
        done();
      });
    });

    it('does not allow an undefined email field', function(done) {
      Agent.create({ password: 'secret' }).then(function(obj) {
        done.fail('This should not have saved');
      }).catch(function(error) {
        expect(Object.keys(error.errors).length).toEqual(1);
        expect(error.errors['email'].message).toEqual('No email supplied');
        done();
      });
    });

    it('does not allow an empty password field', function(done) {
      Agent.create({ email: 'someguy@example.com', password: '   ' }).then(function(obj) {
        done.fail('This should not have saved');
      }).catch(function(error) {
        expect(Object.keys(error.errors).length).toEqual(1);
        expect(error.errors['password'].message).toEqual('No password supplied');
        done();
      });
    });

    it('does not allow an undefined password field', function(done) {
      Agent.create({ email: 'someguy@example.com' }).then(function(obj) {
        done.fail('This should not have saved');
      }).catch(function(error) {
        expect(Object.keys(error.errors).length).toEqual(1);
        expect(error.errors['password'].message).toEqual('No password supplied');
        done();
      });
    });

    it('does not re-hash a password on update', function(done) {
      agent.save().then(function(obj) {
        var passwordHash = agent.password;
        agent.email = 'newemail@example.com';
        agent.save().then(function(obj) {
          expect(agent.password).toEqual(passwordHash); 
          done();
        });
      });
    });

    /**
     * canRead relationship
     */
    describe('canRead', function() {
      let newAgent;
      beforeEach(function(done) {
        agent.save().then(function(obj) {
          new Agent({ email: 'anotherguy@example.com', password: 'secret' }).save().then(function(obj) {;
            newAgent = obj;
            done();
          }).catch(err => {
            done.fail(err);
          });
        }).catch(err => {
          done.fail(err);
        });
      });

      it('does not add a duplicate agent to the canRead field', function(done) {
        agent.canRead.push(newAgent._id);
        agent.save().then(function(result) {
          expect(agent.canRead.length).toEqual(1);
          expect(agent.canRead[0]).toEqual(newAgent._id);

          agent.canRead.push(newAgent._id);
          agent.save().then(function(result) {
            done.fail('This should not have updated');
          }).catch(err => {
            expect(err.message).toMatch('Duplicate values in array');
            done();
          });
        }).catch(err => {
          done.fail(err);
        });
      });

      it('allows two agents to push the same agent ID', function(done) {
        expect (agent.canRead.length).toEqual(0);
        expect (newAgent.canRead.length).toEqual(0);

        let viewableAgent = new Agent({ email: 'vieweableAgent@example.com', password: 'secret' });
        viewableAgent.save().then(function(result) {
        
          agent.canRead.push(viewableAgent._id);
          newAgent.canRead.push(viewableAgent._id);

          agent.save().then(function(result) {
            expect(agent.canRead.length).toEqual(1);
            expect(agent.canRead[0]).toEqual(viewableAgent._id);
  
            newAgent.save().then(function(result) {
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
    describe('#getReadables', function() {
      let newAgent;
      beforeEach(function(done) {
        agent.save().then(function(obj) {
          new Agent({ email: 'anotherguy@example.com', password: 'secret' }).save().then(function(obj) {;
            newAgent = obj;
            agent.canRead.push(newAgent._id);
            agent.save().then(function(result) {
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

      it('retrieve an array containing accessible static directories', function(done) {
        agent.getReadables(function(err, readables) {
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
    describe('.validPassword', function() {
      beforeEach(function(done) {
        agent.save().then(function(obj) {
          done();
        });
      });

      it('returns true if the password is a match', function(done) {
        Agent.validPassword('secret', agent.password, function(err, res) {
          expect(res).toEqual(agent);
          done();
        }, agent);
      });

      it('returns false if the password is not a match', function(done) {
        Agent.validPassword('wrongsecretpassword', agent.password, function(err, res) {
          expect(res).toBe(false);
          done();
        }, agent);
      });
    });

    /**
     * .validPassword
     */
    describe('.getAgentDirectory', function() {
      it('returns a directory path based on the agent\'s email address', () => {
        expect(agent.email).toEqual('someguy@example.com');
        expect(agent.getAgentDirectory()).toEqual('example.com/someguy');
      });
    });
  });
});
