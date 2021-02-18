'use strict'
/** @typedef {import('@adonisjs/framework/src/Request')} Request */
/** @typedef {import('@adonisjs/framework/src/Response')} Response */
/** @typedef {import('@adonisjs/framework/src/View')} View */

const { getResponseError } = require('../Services/response');

class DependenciaProvider {
  /**
   * @param {object} ctx
   * @param {Request} ctx.request
   * @param {Function} next
   */
  async handle ({ request, response }, next) {
    try {
      // get DependenciaID
      let dependenciaId = request.header('DependenciaId');
      if (!dependenciaId) throw new Error('La cabezera DependenciaId es obligatoria');
      // get dependencia
      let { success, message, dependencia } = await request.api_authentication.get(`auth/dependencia/${request.$entity.id}/${dependenciaId}`)
        .then(res => res.data)
        .catch(err => {
          let { data } = err.response;
          let { message, code, status } = err;
          if (typeof data == 'object') {
            message = data.message;
            code = data.code
            status = data.status;
          }
          // response
          return {
            success: false,
            status: status || 501,
            code: code || 'ERR_DEPENDENCIA',
            message: message || err.message
          }
        });
      // validar dependecia
      if (!success) throw new Error(message);
      // add depedencia at ctx
      request.$dependencia = dependencia;
      // call next to advance the request
      await next()
    } catch (error) {
      return getResponseError(response, error, 'ERR_DEPENDENCIA')
    }
  }
}

module.exports = DependenciaProvider
