'use strict'

const ConfigDependencia = use('App/Models/ConfigDependencia');
const NotFoundModelException = require('../../Exceptions/NotFoundModelException');
const collect = require('collect.js');

class ConfigDependenciaController {

    async dependenciaDestino ({ params, request }) {
        let id = params.id;
        let entity = request.$entity;
        let current_dependencia = request.$dependencia;
        if (id != current_dependencia.id) throw new NotFoundModelException("Dependencia Destino");
        let { page } = request.all();
        let config_dependencias = await ConfigDependencia.query()
            .where('entity_id', entity.id)
            .where('dependencia_id', current_dependencia.id)
            .paginate(page || 1, 20);
        config_dependencias = await config_dependencias.toJSON();
        let plucked = collect(config_dependencias.data).pluck('dependencia_destino_id').toArray();
        // obtener dependencias
        let { dependencia } = await request.api_authentication.get(`dependencia?ids=${plucked.join('&ids=')}&page=1`)
            .then(res => res.data)
            .catch(err => ({ dependencia: { data: [] } }));
        config_dependencias.data = dependencia.data;
        // response
        return {
            success: true,
            status: 201,
            dependencia_destinos: config_dependencias,
        }
    }

}

module.exports = ConfigDependenciaController
