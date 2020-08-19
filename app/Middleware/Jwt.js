'use strict'
/** @typedef {import('@adonisjs/framework/src/Request')} Request */
/** @typedef {import('@adonisjs/framework/src/Response')} Response */
/** @typedef {import('@adonisjs/framework/src/View')} View */

class Jwt {
  /**
   * @param {object} ctx
   * @param {Request} ctx.request
   * @param {Function} next
   */
  async handle ({ request, response }, next) {
    try {
      // obtener auth
      let { success, message, user } = await request.api_authentication.get(`me?method=${request.$method}`)
        .then(res => res.data)
        .catch(err => ({
          success: false,
          status: err.status || 401,
          code: err.code || 'ERR_AUTHORIZATION',
          user: {},
          message: err.message
        }));
      // validar auth
      if (success == false) throw new Error(message);
      // add auth in ctx
      request.$auth = user;
      // call next to advance the request
      await next()
    } catch (error) {
      return response.send({
        success: false,
        status: error.status || 501,
        code: error.code || 'ERR_AUTHORIZATION',
        message: error.message
      })
    }
  }
}

module.exports = Jwt
