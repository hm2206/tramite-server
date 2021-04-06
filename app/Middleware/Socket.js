'use strict'
/** @typedef {import('@adonisjs/framework/src/Request')} Request */
/** @typedef {import('@adonisjs/framework/src/Response')} Response */
/** @typedef {import('@adonisjs/framework/src/View')} View */

const socketIo = require('socket.io-client');
const Env = use('Env');

class Socket {
  /**
   * @param {object} ctx
   * @param {Request} ctx.request
   * @param {Function} next
   */
  async handle ({ request }, next) {
    // setting socket
    request.$io = this.connectSocket(request);
    // call next to advance the request
    await next()
  }

  connectSocket = (request = {}) => {
    // app
    let app = request.$app;
    let auth = request.$auth;
    let token = auth.token || {};
    // connectar
    let io = () => {
      return socketIo(Env.get('API_SOCKET_HOST'), {
        path: Env.get('API_SOCKET_PATH', 'socket.io'),
        transports: ['websocket'],
        auth: {
          ClientId: app.client_id,
          ClientSecret: app.client_secret,
          Authorization: `Bearer ${token.token || ""}`
        }
      });
    }
    // response
    return io;
  }

}

module.exports = Socket
