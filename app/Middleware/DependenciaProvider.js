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
        .catch(err => ({
          success: false,
          status: err.status || 301,
          code: err.code || 'ERR_NOT_FOUND_ENTITY',
          message: err.message
        }));
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
