'use strict'

const { Command } = require('@adonisjs/ace')
const { authentication } = require('../Services/apis');
const { getSystemKey } = require('../Services/tools');
const routes = require('../Services/method.json');

class Installer extends Command {
  static get signature () {
    return 'installer:method'
  }

  static get description () {
    return 'Instalar métodos del sistema'
  }

  async handle (args, options) {
    let systemKey = getSystemKey();
    let storage = new URLSearchParams()
    await Object.keys(routes).filter(async (key, index) => {
      let method = routes[key];
      await Object.keys(method).map(m => {
        let attribute = `${m}`;
        storage.append(attribute, method[m]);
      })
    });
    // options
    let config = {
      headers: {
        SystemSecret: systemKey,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    };
    // registrar métodos
    await authentication.post(`installer`, storage, config)
      .then(({data}) => {
        this.success(data.message);
      }).catch(err => {
        this.error(err.message);
      });
  }
}

module.exports = Installer
