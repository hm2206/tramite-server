'use strict'

class NotAuthenticateException extends Error {
  
  constructor() {
    let message = "La applicación no está registrada";
    super(message);
    super.name = 'ERR_NOT_REGISTER_APP';
    this.code = this.name
    this.status = 401;
  }

}

module.exports = NotAuthenticateException
