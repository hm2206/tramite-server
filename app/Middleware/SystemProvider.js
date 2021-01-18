'use strict'
/** @typedef {import('@adonisjs/framework/src/Request')} Request */
/** @typedef {import('@adonisjs/framework/src/Response')} Response */
/** @typedef {import('@adonisjs/framework/src/View')} View */

const { authentication } = require('../Services/apis');
const { getSystemKey } = require('../Services/tools');
const { getResponseError } = require('../Services/response');
const SystemException = require('../Exceptions/SystemException');
const View = use('View');
const Env = use('Env');
const moment = require('moment');
const currencyFormatter = require('currency-formatter')

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
      if (!data.success) throw new SystemException(data.message);
      request.$system = data.system;
      View.global('JSON', JSON);
      View.global('urlReport', (url) => `${Env.get('APP_URL_REPORT')}/${url}`);
      View.global('system', data.system);
      View.global('moment', moment);
      View.global('currencyFormatter', currencyFormatter);
      return await next(request)
    } catch (error) {
      return getResponseError(response, error);
    }
  }
}

module.exports = SystemProvider
