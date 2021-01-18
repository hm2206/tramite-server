'use strict'

class NotAuthenticateException extends Error {
  
  constructor(m) {
    let message = m;
    super(message);
    super.name = 'ERR_AUTHORIZATION';
    this.code = this.name
    this.status = 401;
  }

}

module.exports = NotAuthenticateException
