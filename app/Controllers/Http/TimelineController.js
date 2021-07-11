'use strict'

const collect = require('collect.js');
const File = use('App/Models/File');
const Tramite = use('App/Models/Tramite');
const Tracking = use('App/Models/Tracking');
const Info = use('App/Models/Info');
const NotFoundModelException = require('../../Exceptions/NotFoundModelException')

class TimelineController {

    // obtener entitdad
    _entity = async (request, tramite) => {
        let entity = await request.api_authentication.get(`entity/${tramite.entity_id || '_error'}`)
            .then(res => res.data)
            .catch(err => ({}));
        return entity;
    }

    // obtener sub_trackings
    _settingTracking = async ({ data = [] }, tramites = [], dependencias = [], people = [], infos = []) => {
        return await data.map(tra => {
            // agregar tramite al primer tracking
            if (tra.first) tra.tramite = tramites.where('id', tra.tramite_id).first() || {};
            tra.info = infos.where('id', tra.info_id).first() || {};
            // agregar sub tracking
            if (!tra.first && tra.tracking && tra.status != 'FINALIZADO') {
                tra.dependencia = dependencias.where('id', tra.tracking.dependencia_id).first() || {};
                tra.person = people.where('id', tra.tracking.person_id).first() || {};
                // delete tracking
                delete tra.tracking;
            } else {
                tra.dependencia = dependencias.where('id', tra.dependencia_id).first() || {};
                tra.person = people.where('id', tra.person_id).first() || {};
            }
            // response
            return tra;
        });
    }

    // obtener infos
    _infos = async (ids = []) => {
        let infos = await Info.query()
            .with('files', (build) => build.where('object_type', 'App/Models/Info'))
            .join('trackings as tra', 'tra.info_id', 'infos.id')
            .whereIn('tra.id', ids)
            .select('infos.*')
            .fetch();
        return collect(await infos.toJSON());
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
        let dependenciaIds = [
            ...db.pluck('dependencia_id').toArray(),
            tramite.dependencia_origen_id,
            ...db.pluck('tracking.dependencia_id').toArray(),
        ]
        // obtener dependencias
        let { dependencia } = await request.api_authentication.get(`dependencia?ids[]=${dependenciaIds.join('&ids[]=')}`)
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
        let tracking_person_id = db.pluck('tracking.person_id');
        let ids = collect([
            tramite.person_id,
            ...tracking_person_id,
            ...person_id,
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
            ...tramite_id,
            tramite.id,
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
            .withCount('multiples')
            .with('tracking')
            .join('tramites as tra', 'tra.id', 'trackings.tramite_id')
            .where('tra.slug', tramite.slug)
            .whereIn('trackings.status', ['REGISTRADO', 'ENVIADO', 'SUBTRAMITE', 'DERIVADO', 'ACEPTADO', 'RECHAZADO', 'RESPONDIDO', 'ANULADO', 'FINALIZADO'])
            .select('trackings.*')
            .paginate(page || 1, 20);
        trackings = await trackings.toJSON();
        // obtener dependencias
        let entity = await this._entity(request, tramite);
        let tramites = await this._tramites(request, trackings);
        let dependencias = await this._dependencias(request, tramite, trackings);
        let people = await this._people(request, tramite, trackings);
        let files = await this._files(request, tramite, trackings);
        // obtener infos
        let db = collect(trackings.data);
        let infos = await this._infos([ ...db.pluck('id').toArray(), ...db.pluck('tracking_id').toArray() ]);
        // configurar tramites
        await tramites.map(t => {
            t.dependencia_origen = dependencias.where('id', t.dependencia_origen_id).first() || {};
            t.person = people.where('id', t.person_id).first() || {};
            t.files = files.where('object_type', 'App/Models/Tramite').where('object_id', t.id).toArray() || [];
            return t;
        })
        // configurar tracking
        trackings.data = await this._settingTracking(trackings, tramites, dependencias, people, infos);
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
