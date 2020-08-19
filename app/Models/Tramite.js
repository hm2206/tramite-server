'use strict'

/** @type {typeof import('@adonisjs/lucid/src/Lucid/Model')} */
const Model = use('Model')
const { URL } = require('../../utils');

class Tramite extends Model {

    static boot() {
        super.boot();
        this.addHook('afterCreate', 'TramiteHook.createTracking');
    }

    getUrlFile = (up = false) => {
        this.file = URL(this.file, up);
    }

}

module.exports = Tramite
