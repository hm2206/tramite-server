'use strict'
/** @typedef {import('@adonisjs/framework/src/Request')} Request */
/** @typedef {import('@adonisjs/framework/src/Response')} Response */
/** @typedef {import('@adonisjs/framework/src/View')} View */

class Allow {
  /**
   * @param {object} ctx
   * @param {Request} ctx.request
   * @param {Function} next
   */
  async handle ({ request, response }, next, props) {
    try {
      // get method
      request.$method = props[0];
      // send method
      let { success, message, app } = await request.api_authentication.get(`app/me?allow=${request.$method}`)
        .then(res => res.data)
        .catch(err => ({
          success: true,
          code: err.code,
          message: err.message,
          app: {}
        }));
      // validar method app
      if (!success) throw new Error(message); 
      // call next to advance the request
      await next()
    } catch (error) {
      return response.send({
        success: false,
        status: error.status || 501,
        code: error.code || 'ERR_ALLOW',
        message: error.message
      })
    }
  }
}

module.exports = Allow
