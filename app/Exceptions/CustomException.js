'use strict'

class CustomException extends Error {
  
  constructor(message, name = null, status = 501) {
    super(message);
    super.name = `ERR_${name || 'CUSTOM'}`;
    this.code = this.name;
    this.status = status;
  }

}

module.exports = CustomException