/**
 * Singleton keystore
 *
 * How to sign a token:
 *
 * ```
 * const signedAccessToken = jwt.sign({some_json_token}, prv, { algorithm: 'RS256', header: { kid: result.kid } });
 * ```
 */
const jwt = require('jsonwebtoken');
const jose = require('node-jose');
const pem2jwk = require('pem-jwk').pem2jwk
const NodeRSA = require('node-rsa');

/**
 * Build RSA key
 */
const key = new NodeRSA({b: 512, e: 5});
key.setOptions({
  encryptionScheme: {
    scheme: 'pkcs1',
    label: 'Optimization-Service'
  }
});

const keystore = jose.JWK.createKeyStore();

class KeyStore {

  constructor() {
    return (async () => {

      /**
       * Build RSA key
       */
      const key = new NodeRSA({b: 512, e: 5});
      key.setOptions({
        encryptionScheme: {
          scheme: 'pkcs1',
          label: 'Optimization-Service'
        }
      });

      // Get public/private pair
      this._prv = key.exportKey('pkcs1-private-pem');
      this._pub = key.exportKey('pkcs8-public-pem');

      /**
       * A keystore stores the keys. You must assume there can be more than
       * one (key, that is)
       */
      this._keystore = jose.JWK.createKeyStore();

      // Convert PEM to JWK object
      let jwkPub = pem2jwk(this._pub);
      jwkPub.use = 'sig';
      jwkPub.alg = 'RS256';

      await this._keystore.add(jwkPub, 'pkcs8');

      return this;
    })();
  }

  get keystore() {
    return this._keystore;
  }

  get prv() {
    return this._prv;
  }

  get pub() {
    return this._pub;
  }

  get keyStuff() {
    return { pub: this._pub, prv: this._prv, keystore: this._keystore };
  }
}

const instance = new KeyStore();

module.exports = instance;

