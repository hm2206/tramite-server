'use strict'
/** @typedef {import('@adonisjs/framework/src/Request')} Request */
/** @typedef {import('@adonisjs/framework/src/Response')} Response */
/** @typedef {import('@adonisjs/framework/src/View')} View */

const { authentication, tramite } = require('../Services/apis');
const { getClient, getAuthorization, getSystemKey } = require('../Services/tools');

class AppProvider {
  /**
   * @param {object} ctx
   * @param {Request} ctx.request
   * @param {Function} next
   */
  async handle ({ request, response }, next) {
    // configurar axios 
    authentication.config(getClient(request));
    authentication.config(getAuthorization(request));
    authentication.config({ SystemSecret: getSystemKey() });
    // add apis en el ctx;
    request.api_authentication = authentication;
    request.api_tramite = tramite;
    // call next to advance the request
    await next()
  }
}

module.exports = AppProvider
