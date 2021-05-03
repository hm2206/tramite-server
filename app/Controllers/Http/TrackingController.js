'use strict'

const Tracking = use('App/Models/Tracking');
const File = use('App/Models/File');
const collect = require('collect.js');
const NotFoundModelException = require('../../Exceptions/NotFoundModelException')
const { validation } = require('validator-error-adonis');

class TrackingController {

    // obtener tracking
    show = async ({ params, request }) => {
        // obtener tracking
        let tracking = await Tracking.query()
            .with('verify')
            .with('tramite', (build) => {
                build.with('tramite_type');
            }).where('tramite_id', params.id)
            .first();
        // obtener tramite
        let tramite = await tracking.tramite().fetch();
        // obtener dependencias
        let dependenciaIds = [tracking.dependencia_origen_id, tracking.dependencia_destino_id, tramite.dependencia_origen_id];
        let dependencias = await request.api_authentication.get(`dependencia?ids[]=${dependenciaIds.join('&ids[]=')}`)
            .then(res => {
                let { dependencia } = res.data;
                return dependencia.data;
            }).catch(err => ([]));
        // obtener persona
        let personIds = [tracking.person_id, tramite.person_id];
        let people = await request.api_authentication.get(`find_people?id[]=${personIds.join('&id[]=')}`)
            .then(res => res.data)
            .catch(err => ([]));
        // setting collection
        dependencias = collect(dependencias);
        people = collect(people);
        // obtener code_qr;
        let code_qr = await tramite.funcCodeQr();
        // setting tracking
        tracking = await tracking.toJSON();
        tracking.person = people.where('id', tracking.person_id).first() || {};
        tracking.dependencia_origen = dependencias.where('id', tracking.dependencia_origen_id).first() || {};
        tracking.dependencia_destino = dependencias.where('id', tracking.dependencia_destino_id).first() || {};
        // setting tramite
        tracking.tramite.person = people.where('id', tracking.tramite.person_id).first() || {};
        tracking.tramite.dependencia_origen = dependencias.where('id', tracking.tramite.dependencia_origen_id).first() || {};
        // archivos
        let files = await File.query()
            .whereIn('object_type', ['App/Models/Tracking', 'App/Models/Tramite'])
            .whereIn('object_id', [tracking.id, tracking.tramite_id])
            .fetch();
        files = collect(await files.toJSON());
        // add files
        tracking.files = await files.where('object_type', 'App/Models/Tracking').where('object_id', tracking.id).toArray();
        tracking.tramite.files = await files.where('object_type', 'App/Models/Tramite').where('object_id', tracking.tramite_id).toArray();
        tracking.tramite.code_qr = code_qr;
        // obtener files antiguos
        let old_files = await File.query()
            .join('tramites as tra', 'tra.id', 'files.object_id')
            .where('files.object_type', 'App/Models/Tramite')
            .where('tra.slug', tramite.slug)
            .whereNotIn('tra.id', [tramite.id])
            .select('files.*')
            .fetch();
        // response 
        return {
            success: true,
            status: 201,
            tracking
        }
    }

    // obtener multiple
    multiple = async ({ params, request }) => {
        let { page } = request.all();
        let tracking = await Tracking.query()
            .where('multiple', 1)
            .where('id', params.id)
            .first();
        // validar tracking
        if (!tracking) throw new NotFoundModelException("El seguimiento");
        // obtener seguimiento multiple
        let multiples = await Tracking.query()
            .where('tracking_id', tracking.id)
            .paginate(page || 1, 20);
        // parse json
        multiples = await multiples.toJSON();
        // add collect
        let collection = collect(multiples.data);
        // obtener dependencias
        let plucked = await collection.pluck('dependencia_id').toArray();
        let dependencias = await this._getDependencias(request, [...plucked, tracking.dependencia_id]);
        // obtener people
        let pluckedPerson = await collection.pluck('person_id').toArray();
        let people = await this._getPerson(request, pluckedPerson);
        // setting 
        multiples.data.map(d => {
            d.dependencia = dependencias.where(`id`, d.dependencia_id).first() || {};
            d.person = people.where('id', d.person_id).first() || {};
            return d;
        });
        // response
        return { 
            success: true,
            status: 201,
            tracking,
            multiples
        }
    }

    // actualizar tracking
    update = async ({ params, request }) => {
        // validar datos
        await validation(null, request.all(), {
            description: "max:1000"
        });
        // obtener tracking
        let tracking = await Tracking.find(params.id);
        if (!tracking) throw NotFoundModelException("El seguímiento");
        // actualizar
        tracking.merge({ 
            description: request.input('description', null)
        });
        await tracking.save();
        // response
        return {
            success: true,
            status: 201,
            message: "Los cambios se guardarón correctamente!",
            tracking
        }
    }

    // obtener dependencias
    _getDependencias = async (request, ids = []) => {
        let { success, dependencia } = await request.api_authentication.get(`dependencia?ids[]=${ids.join('&ids[]=')}`)
        .then(res => res.data)
        .catch(err => ({ success: false, dependencia: {} }));
        if (!success) return collect([]);
        return collect(dependencia.data || []);
    }

    // obtener persona
    _getPerson = async (request, ids = []) => {
        let response = await request.api_authentication.get(`find_people?id[]=${ids.join('&id[]=')}`)
        .then(res => res.data)
        .catch(err => ([]));
        return collect(response);
    }

}

module.exports = TrackingController
