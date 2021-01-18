'use strict'

class SystemException extends Error {
  
  constructor(m) {
    let message = m;
    super(message);
    super.name = 'ERR_SYSTEM';
    this.code = this.name
    this.status = 500;
  }

}

module.exports = SystemException
