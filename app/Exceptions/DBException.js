'use strict'

const customMessages = {
  "1062": {
    message: `El {tag} ya existe`,
    status: 409
  }
};


class DBException extends Error {
  
  constructor(error, tag = 'Objecto') {
    let { errno } = error;
    let newMessage = { message: error.message || "", status: error.status || 501 };
    if (typeof errno != 'undefined') {
      newMessage = customMessages[errno] || { message: "Algo salió mal", status: 501 };
    }
    super(`${newMessage.message}`.replace("{tag}", tag));
    this.name = `DB_EXCEPTION`;
    this.code = error.code;
    this.status = newMessage.status;
  }

}

module.exports = DBException