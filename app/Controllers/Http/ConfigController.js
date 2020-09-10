'use strict'

const Config = use('App/Models/Config');

class ConfigController {

    index = async ({ request, response }) => {
        let { page, query_search, variable } = request.all();
        let config = Config.query()
        // filtros
        if (query_search) config.where('key', 'like', `%${query_search}%`);
        if (variable) config.where('variable', variable);
        // get paginate
        config = await config.paginate(page || 1, 20);
        // response 
        return {
            success: true,
            status: 201,
            code: 'RES_CONFIG',
            config
        };
    }

    show = async ({ params, request, response }) => {
        let { variable } = request.input('variable');
        let config = Config.query()
            .where('key', params.key);
        // filtro por variable
        if (variable) config.where('variable', variable);
        // get config 
        config = await config.first(); 
        if (!config) throw new Error("No se encontró la configuración")
        // response 
        return {
            success: true,
            status: 201,
            config
        };
    }  

}

module.exports = ConfigController
