'use strict'
/** @typedef {import('@adonisjs/framework/src/Request')} Request */
/** @typedef {import('@adonisjs/framework/src/Response')} Response */
/** @typedef {import('@adonisjs/framework/src/View')} View */

const { getResponseError } = require('../Services/response');
const View = use('View');

class EntityProvider {
  /**
   * @param {object} ctx
   * @param {Request} ctx.request
   * @param {Function} next
   */
  async handle ({ request, response }, next) {
    try {
      // get entityId
      let id = await this.getEntityId(request);
      if (!id) throw new Error("La cabezera EntityID es obligatoria");
      // validar entity
      let { data } = await request.api_authentication.get(`auth/entity/${id}`);
      if (!data.id) throw new Error("No se encontró la entidad!");
      // inject entity
      request.$entity = data;
      View.global('entity', data);
      // call next to advance the request
      await next()
    } catch (error) {
      return getResponseError(response, error, 'ERR_ENTITY_ID');
    }
  }

  getEntityId = (request) => {
    return request.header('EntityId') || request.input('EntityId');
  }

}

module.exports = EntityProvider
