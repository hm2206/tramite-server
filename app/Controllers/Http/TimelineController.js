'use strict'

const collect = require('collect.js');
const File = use('App/Models/File');
const Tramite = use('App/Models/Tramite');
const Tracking = use('App/Models/Tracking');
const NotFoundModelException = require('../../Exceptions/NotFoundModelException')

class TimelineController {

    // obtener entitdad
    _entity = async (request, tramite) => {
        let entity = await request.api_authentication.get(`entity/${tramite.entity_id || '_error'}`)
            .then(res => res.data)
            .catch(err => ({}));
        return entity;
    }

    // obtener tramite hijos
    _tramites = async (request, trackings) => {
        let ids = collect(trackings.data).groupBy('tramite_id').keys().toArray();
        let tramites = await Tramite.query()
            .with('tramite_type')
            .whereIn('id', ids)
            .fetch();
        // response
        tramites = await tramites.toJSON();
        return collect(tramites);
    }

    // obtener dependencias
    _dependencias = async (request, tramite, trackings) => {
        let db = collect(trackings.data);
        let dependencia_origen_id = db.pluck('dependencia_origen_id').toArray();
        let dependencia_destino_id = db.pluck('dependencia_destino_id').toArray();
        let tramite_dependencia_id = db.pluck('tramite_dependencia_id').toArray();
        let ids = collect([
            ...dependencia_origen_id,
            ...dependencia_destino_id,
            ...tramite_dependencia_id
        ]).toArray();
        // obtener dependencias
        let { dependencia } = await request.api_authentication.get(`dependencia?ids[]=${ids.join('&ids[]=')}`)
            .then(res => res.data)
            .catch(err => ({
                success: false,
                status: err.status || 501,
                dependencia: { data: [] }
            }));
        // response
        return collect(dependencia.data);
    }

    // obtener remitentes
    _people = async (request, tramite, trackings) => {
        let db = collect(trackings.data);
        let person_id = db.pluck('person_id').toArray();
        let tramite_person_id = db.pluck('tramite_person_id').toArray();
        let ids = collect([
            ...person_id,
            ...tramite_person_id
        ]).toArray();
        let people = await request.api_authentication.get(`find_people?id[]=${ids.join('&id[]=')}`)
            .then(res => res.data)
            .catch(err => ([]));
        // response
        return collect(people);
    }

    // obtener archivos
    _files = async (request, tramite, trackings) => {
        let db = collect(trackings.data);
        let tracking_id = db.pluck('id').toArray();
        let tramite_id = db.pluck('tramite_id').toArray();
        let ids = collect([
            ...tracking_id,
            ...tramite_id
        ]).toArray();
        let files = await File.query()
            .whereIn('object_type', ['App/Models/Tramite', 'App/Models/Tracking'])
            .whereIn('object_id', ids)
            .fetch();
        files = await files.toJSON();
        // response
        return collect(files);
    }

    // línea de tiempo y trámite
    handle = async ({ params, request }) => {
        let { page, query_search } = request.all();
        let tramite = await Tramite.query()
            .with('tramite_type')
            .where('slug', params.slug)
            .whereNull('tramite_parent_id')
            .first();
        if (!tramite) throw new NotFoundModelException('El trámite');
        // obtener tracking
        let trackings = await Tracking.query()
            .join('tramites as tra', 'tra.id', 'trackings.tramite_id')
            .where('tra.slug', tramite.slug)
            .whereIn('trackings.status', ['REGISTRADO', 'DERIVADO', 'ACEPTADO', 'RECHAZADO', 'RESPONDIDO', 'ANULADO', 'FINALIZADO'])
            .select('trackings.*', 'tra.dependencia_origen_id as tramite_dependencia_id', 'tra.person_id as tramite_person_id')
            .paginate(page || 1, 20);
        trackings = await trackings.toJSON();
        // obtener dependencias
        let entity = await this._entity(request, tramite);
        let tramites = await this._tramites(request, trackings);
        let dependencias = await this._dependencias(request, tramite, trackings);
        let people = await this._people(request, tramite, trackings);
        let files = await this._files(request, tramite, trackings);
        // configurar tramites
        await tramites.map(t => {
            t.dependencia_origen = dependencias.where('id', t.dependencia_origen_id).first() || {};
            t.person = people.where('id', t.person_id).first() || {};
            t.files = files.where('object_type', 'App/Models/Tramite').where('object_id', t.id).toArray() || [];
            return t;
        })
        // configurar datos
        await trackings.data.map(tra => {
            tra.dependencia = dependencias.where('id', tra.dependencia_id).first() || {};
            tra.dependencia_origen = dependencias.where('id', tra.dependencia_origen_id).first() || {};
            tra.dependencia_destino = dependencias.where('id', tra.dependencia_destino_id).first() || {};
            tra.person = people.where('id', tra.person_id).first() || {};
            tra.files = files.where('object_type', 'App/Models/Tracking').where('object_id', tra.id).toArray() || [];
            // agregar tramite al primer tracking
            if (tra.first) tra.tramite = tramites.where('id', tra.tramite_id).first() || {};
            // response
            return tra;
        });
        // trámite
        tramite.entity = entity;
        tramite.person = people.where('id', tramite.person_id).first() || {};
        tramite.dependencia_origen = dependencias.where('id', tramite.dependencia_origen_id).first() || {};
        tramite.files = files.where('object_type', 'App/Models/Tramite').where('object_id', tramite.id).toArray() || [];
        // response
        return {
            success: true,
            status: 201,
            tramite,
            trackings
        };
    }

}

module.exports = TimelineController
