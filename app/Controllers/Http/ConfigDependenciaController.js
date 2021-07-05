'use strict'

const ConfigDependencia = use('App/Models/ConfigDependencia');
const NotFoundModelException = require('../../Exceptions/NotFoundModelException');
const collect = require('collect.js');
const DBException = require('../../Exceptions/DBException');
const { ValidatorError, validation } = require('validator-error-adonis');

class ConfigDependenciaController {

    async store ({ request }) {
        await validation(null, {
            dependencia_destino_id: 'required'
        });
        let entity = request.$entity;
        let payload = {
            entity_id: entity.id,
            dependencia_id: request.input('dependencia_id'),
            dependencia_destino_id: request.input('dependencia_destino_id')
        };
        // validar 
        let is_exists = await ConfigDependencia.query()
            .where('entity_id', entity.id)
            .where('dependencia_id', payload.dependencia_id)
            .where('dependencia_destino_id', payload.dependencia_destino_id)
            .getCount('id');
        if (is_exists) throw new ValidatorError([{ field: "dependencia_destino_id", message: "La dependencia destino ya existe" }]);
        // guardar
        try {
            let config_dependencia = await ConfigDependencia.create(payload);
            // response
            return {
                success: true,
                status: 201,
                message: "Los datos se guardarón correctamente!",
                config_dependencia
            }
        } catch (error) {
            throw new DBException("regístro")
        }
    }

    async dependenciaDestino ({ params, request }) {
        let id = params.id;
        let entity = request.$entity;
        let { page } = request.all();
        let config_dependencias = await ConfigDependencia.query()
            .where('entity_id', entity.id)
            .where('dependencia_id', id)
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

    async delete ({ params, request }) {
        let entity = request.$entity;
        let dependencia_id = request.input('dependencia_id', '')
        try {
            let config_dependencia = await ConfigDependencia.query()
                .where('entity_id', entity.id)
                .where('dependencia_id', dependencia_id)
                .where('dependencia_destino_id', params.id)
                .first();
            await config_dependencia.delete();
            // response
            return {
                success: true,
                status: 201,
                message: "La dependencia destino se elimino correctamente!"
            }
        } catch (error) {
            throw new Error("No se pudo eliminar la dependencia destino");
        }
    }

}

module.exports = ConfigDependenciaController
