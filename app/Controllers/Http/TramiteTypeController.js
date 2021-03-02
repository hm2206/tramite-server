'use strict'

const TramiteType = use('App/Models/TramiteType');
const { validate, validateAll } = use('Validator');
const { validation,ValidatorError } = require('validator-error-adonis');

class TramiteTypeController {

    index = async ({ request }) => {
        let { page, query_search } = request.all();
        let state = request.input('state', 1);
        // get tramite_type
        let tramite_type = TramiteType.query()
            .where('state', state);
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

    store = async ({ request }) => {
        await validation(validateAll, request.all(), {
            short_name: "required|unique:tramite_types",
            description: "required|max:100"
        });
        // crear
        await TramiteType.create({ 
            short_name: `${request.input('short_name')}`,
            description: `${request.input('description')}`
        });
        // response
        return {
            success: true,
            status: 201,
            code: 'RES_TRAMITE_TYPE',
            message: "Los datos se guardaron correctamente!"
        }
    }

    show = async ({ params, request }) => {
        let tramite_type = await TramiteType.findOrFail(params.id);
        // response 
        return {
            success: true,
            status: 201,
            code: 'TRAMITE_TYPE',
            tramite_type
        }
    }

    update = async ({ params, request }) => {
        await validation(validateAll, request.all(), {
            short_name: 'required|max:3',
            description: 'required|max:100'
        });
        // validar short_name
        if (await TramiteType.query().whereRaw(`id <> ${params.id} AND short_name = '${request.input('short_name')}'`).getCount()) throw new ValidatorError([
            { field: "short_name", message: "El nombre corto ya está en uso" }
        ]);
        // get tramite_types
        let tramite = await TramiteType.findOrFail(params.id);
        // update 
        tramite.short_name = `${request.input('short_name')}`;
        tramite.description = `${request.input('description')}`;
        await tramite.save();
        // response 
        return {
            success: true,
            status: 201,
            code: 'RES_UPDATE_TRAMITE_TYPE',
            message: 'Los datos se actualizaron correctamente!'
        }
    }

    state = async ({ params, request }) => {
        let state = request.input('state', 1);
        // get tramite_types
        let tramite = await TramiteType.findOrFail(params.id);
        // changed state
        tramite.state = state;
        await tramite.save();
        // response 
        return {
            success: true,
            status: 201,
            code: 'RES_UPDATE_TRAMITE_TYPE',
            message: `El Tip. Trámite se ${state ? 'Activo' : 'Desactivó'}`
        }
    }

}

module.exports = TramiteTypeController
