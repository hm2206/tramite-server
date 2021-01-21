'use strict'

const DB = use('Database');

class AuthStatusController {

    handle = async ({ request }) => {
        let entity = request.$entity;
        let dependencia = request.$dependencia;
        let auth = request.$auth;
        // permitidos
        let allow_status = request.input('status', ['REGISTRADO', 'PENDIENTE', 'ACEPTADO', 'FINALIZADO', 'RECHAZADO', 'ENVIADO', 'DERIVADO', 'ANULADO']);
        // select dinamico
        let select_status = [];
        allow_status.map(allow => {
            let raw_status = DB.table('trackings as tra')
                .join('tramites as t', 't.id', 'tra.tramite_id')
                .where('t.entity_id', entity.id)
                .where('tra.dependencia_id', dependencia.id)
                .where('tra.status', allow)
                .where('tra.revisado', 0)
                .where('tra.visible', 1)
                .whereRaw(`IF(modo = 'YO', IF(tra.user_verify_id = ${auth.id}, 1, 0), 1)`)
                .select(DB.raw(`count(tra.status)`))
            // add select
            select_status.push(`(${raw_status}) as ${allow}`);
        });
        // find status
        let tracking_status = await DB.table(DB.raw('DUAL'))
            .select(DB.raw(select_status.join(",")))
            .first();
        // response
        return {
            success: true,
            status: 201,
            tracking_status
        };
    }

}

module.exports = AuthStatusController
