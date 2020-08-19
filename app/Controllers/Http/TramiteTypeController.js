'use strict'

const TramiteType = use('App/Models/TramiteType');

class TramiteTypeController {

    index = async ({ request }) => {
        let { page, query_search } = request.all();
        // get tramite_type
        let tramite_type = TramiteType.query()
        // filtros
        if (query_search) tramite_type.whereRaw(`(short_name LIKE '%${query_search}%' OR nombre LIKE '%${query_search}%')`)
        // paginación
        tramite_type = await tramite_type.paginate(page || 1, 20);
        // response 
        return {
            success: true,
            status: 201,
            code: 'RES_TRAMITE_TYPE',
            tramite_type
        }
    }

}

module.exports = TramiteTypeController
