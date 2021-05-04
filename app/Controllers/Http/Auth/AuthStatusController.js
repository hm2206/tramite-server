'use strict'

const DB = use('Database');

class AuthStatusController {

    handle = async ({ request }) => {
        let entity = request.$entity;
        let dependencia = request.$dependencia;
        let auth = request.$auth;
        let modo = `${request.input('modo', 'YO')}`.toUpperCase();
        // permitidos
        let allow_status = request.input('status', ['REGISTRADO', 'PENDIENTE', 'ACEPTADO', 'FINALIZADO', 'RECHAZADO', 'RECIBIDO', 'RESPONDIDO', 'COPIA', 'DERIVADO', 'ANULADO']);
        // select dinamico
        let select_status = [];
        allow_status.map(allow => {
            let raw_status = DB.table('trackings as tra')
                .join('tramites as t', 't.id', 'tra.tramite_id')
                .where('t.entity_id', entity.id)
                .where('tra.dependencia_id', dependencia.id)
                .where('tra.status', allow)
                .whereIn('tra.modo', modo == 'YO' ? ['YO', 'DEPENDENCIA'] : ['DEPENDENCIA'])
                .whereNull('tra.readed_at')
                .select(DB.raw(`count(tra.status)`))
            // validar yo
            if (modo == 'YO') raw_status.where('tra.user_verify_id', auth.id)
                .where('tra.archived', 0);
            // add select
            select_status.push(`(${raw_status}) as ${allow}`);
        });
        // obtener archivados
        let [{ARCHIVED}] = await DB.table('trackings as tra')
            .join('tramites as t', 't.id', 'tra.tramite_id')
            .where('t.entity_id', entity.id)
            .where('tra.dependencia_id', dependencia.id)
            .whereIn('tra.status', allow_status)
            .whereNull('tra.readed_at')
            .where('tra.archived', 1)
            .select(DB.raw(`count(tra.status) as ARCHIVED`));
            // find status
        let tracking_status = await DB.table(DB.raw('DUAL'))
            .select(DB.raw(select_status.join(",")))
            .first();
        tracking_status.ARCHIVED = ARCHIVED;
        // response
        return {
            success: true,
            status: 201,
            tracking_status
        };
    }

}

module.exports = AuthStatusController
