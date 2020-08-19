'use strict'
/** @typedef {import('@adonisjs/framework/src/Request')} Request */
/** @typedef {import('@adonisjs/framework/src/Response')} Response */
/** @typedef {import('@adonisjs/framework/src/View')} View */

const { authentication } = require('../Services/apis');
const { getSystemKey } = require('../Services/tools');

class SystemProvider {
  /**
   * @param {object} ctx
   * @param {Request} ctx.request
   * @param {Function} next
   */
  async handle ({ request, response }, next) {
    try {
      // validar systema
      let { data } = await authentication.get('system/auth/me', { headers: { SystemSecret: getSystemKey() } });
      if (!data.success) throw new Error(data.message);
      request._system = data.system;
      return await next(request)
    } catch (error) {
      return response.send({
        success: false,
        status: error.status || 501,
        code: error.code || "ERR_SYSTEM",
        message: error.message
      });
    }
  }
}

module.exports = SystemProvider
