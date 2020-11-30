'use strict'

/** @type {typeof import('@adonisjs/lucid/src/Lucid/Model')} */
const Model = use('Model')

class Tracking extends Model {

    tramite = () => {
        return this.belongsTo('App/Models/Tramite');
    }

}

module.exports = Tracking
