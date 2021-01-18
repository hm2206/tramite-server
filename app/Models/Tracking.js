'use strict'

/** @type {typeof import('@adonisjs/lucid/src/Lucid/Model')} */
const Model = use('Model')

class Tracking extends Model {

    static get hidden () {
        return ['visible'];
    }

    static boot() {
        super.boot();
        this.addHook('afterCreate', 'TrackingHook.createVerify');
        this.addHook('afterDelete', 'TrackingHook.deleteVerify');
    }

    tramite = () => {
        return this.belongsTo('App/Models/Tramite');
    }

    verify = () => {
        return this.hasOne('App/Models/Verify', 'user_verify_id', 'user_id')
    }

}

module.exports = Tracking
