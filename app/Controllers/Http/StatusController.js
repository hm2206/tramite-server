'use strict'

const DB = use('Database');

class StatusController {

    tramiteInterno = async ({ request }) => {
        let status = await this._getAllowStatus({ request });
        // response
        return {
            success: true,
            status: 201,
            code: 'RES_STATUS_TRAMITE',
            status_count: status || {}
        }
    }

    bandeja = async ({ request }) => {
        let status = await this._getAllowStatus({ request, user_destino_id: request.$auth.id });
        // response
        return {
            success: true,
            status: 201,
            code: 'RES_STATUS_TRAMITE',
            status_count: status || {}
        }
    }

    _getAllowStatus = async ({ request, user_destino_id }) => {
        let allow_status = request.input('status', ['REGISTRADO', 'PENDIENTE', 'ACEPTADO']);
        // select dinamico
        let select_status = [];
        allow_status.map(allow => {
            let raw_status = DB.table('trackings as tra')
                .join('tramites as t', 't.id', 'tra.tramite_id')
                .where('t.entity_id', request._entity.id)
                .where('dependencia_destino_id', request._dependencia.id)
                .where('tra.status', allow)
                .select(DB.raw(`count(tra.status)`))
            // filter user_destino_id
            if (user_destino_id) raw_status.where('tra.user_destino_id', user_destino_id);
            else raw_status.whereNull('tra.user_destino_id');
            // add select
            select_status.push(`(${raw_status}) as ${allow}`);
        });
        // find status
        return await DB.table(DB.raw('DUAL'))
            .select(DB.raw(select_status.join(",")))
            .first();
    }

}

module.exports = StatusController
