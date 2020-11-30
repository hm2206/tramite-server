'use strict'

const TramiteHook = exports = module.exports = {}

const Tracking = use('App/Models/Tracking');
const Role = use('App/Models/Role');

TramiteHook.createTracking = async (tramite) => {
    let user_verify_id = tramite.user_id;
    // validar si está es interno o externo
    if (!tramite.verify) {
        let role = await Role.query()
            .where("entity_id", tramite.entity_id)
            .where("dependencia_id", tramite.dependencia_id)
            .where("level", "BOSS")
            .first();
        // obtener role
        if (role) user_verify_id = role.user_id;
    }
    // crear tracking
    await Tracking.create({ 
        description: '---',
        user_id: tramite.user_id,
        user_destino_id: tramite.verify ? tramite.user_id : null,
        tramite_id: tramite.id,
        dependencia_id: tramite.dependencia_id,
        dependencia_origen_id: tramite.dependencia_id,
        dependencia_destino_id: tramite.dependencia_id,
        current: 1,
        parent: tramite.dependencia_origen_id ? 1 : 0,
        status: tramite.dependencia_origen_id ? 'REGISTRADO' : 'ENVIADO',
        next: 0,
        user_verify_id
    });
}
