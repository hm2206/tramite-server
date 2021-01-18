'use strict'

class NotFoundModelException extends Error {
  
  constructor(name) {
    let message = `No se encontró: ${name}`;
    super(message);
    super.name = 'NOT_FOUND_MODEL';
    this.code = this.name
    this.status = 404;
  }

}

module.exports = NotFoundModelException
