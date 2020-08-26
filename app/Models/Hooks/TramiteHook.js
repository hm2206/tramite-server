'use strict'

const TramiteHook = exports = module.exports = {}

const Tracking = use('App/Models/Tracking');

TramiteHook.createTracking = async (tramite) => {
    await Tracking.create({ 
        description: '---',
        user_id: tramite.user_id,
        user_destino_id: tramite.user_id || null,
        tramite_id: tramite.id,
        dependencia_id: tramite.dependencia_id,
        dependencia_origen_id: tramite.dependencia_id,
        dependencia_destino_id: tramite.dependencia_id,
        current: 1,
        parent: tramite.dependencia_origen_id ? 1 : 0,
        status: tramite.dependencia_origen_id ? 'REGISTRADO' : 'ENVIADO'
    });
}
