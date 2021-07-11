'use strict'

const Tracking = use('App/Models/Tracking');
const File = use('App/Models/File');
const collect = require('collect.js');
const moment = require('moment');
const NotFoundModelException = require('../../../Exceptions/NotFoundModelException');
const DB = use('Database');
const Tramite = use('App/Models/Tramite');
const codeQR = require('qrcode');

class AuthTramiteController {

    // listar tramite
    index = async ({ request }) => {
        // configs
        let dependencia = request.$dependencia;
        let entity = request.$entity;
        let auth = request.$auth;
        // filtros
        let { query_search, page, tramite_type_id } = request.all();
        let tramites = Tramite.query()
            .with('tramite_type')
            .where('tramites.entity_id', entity.id)
            .where('tramites.dependencia_origen_id', dependencia.id)
            .where('tramites.person_id', auth.person_id);
        // filtrar por query search
        if (query_search) tramites.leftJoin('files as f', 'f.object_id', 'tramites.id')
            .where('f.object_type', 'App/Models/Tramite')
            .where(DB.raw(`(
                tramites.slug like '%${query_search}%' OR
                tramites.document_number like '%${query_search}%' OR 
                tramites.asunto like '%${query_search}%' OR
                f.name like '%${query_search}%'
            )`));
        // filtrar por tipo de documento
        if (tramite_type_id) tramites.join('tramite_types as tra')
            .where('tra.id', tramite_type_id);
        // onbtener datos
        tramites = await tramites.select('tramites.*')
            .paginate(page || 1, 20);
        tramites = await tramites.toJSON();
        let datos = collect(tramites.data);
        // obtener personas
        let personIds = await datos.pluck('person_id').toArray();
        let people = await this._people(request, personIds);
        // obtener files
        let tramiteIds = await datos.pluck('id').toArray();
        console.log(tramiteIds);
        let files = await this._files(tramiteIds, ['App/Models/Tramite']);
        // setting
        await tramites.data.map(async tra => {
            tra.person = people.where('id', tra.person_id).first() || {};
            tra.entity = entity;
            tra.dependencia_origen = dependencia; 
            tra.files = files.where('object_id', tra.id).toArray();
            return tra;
        });
        // response
        return {
            success: true,
            status: 201,
            tramites
        }
    }

    // obtener tracking
    show = async ({ params, request }) => {
        // obtener setting
        let entity = request.$entity;
        let dependencia = request.$dependencia;
        let auth = request.$auth;
        // obtener tracking
        let tracking = await Tracking.query()
            .setHidden([])
            .join('tramites as tra', 'tra.id', 'trackings.tramite_id')
            .withCount('multiples')
            .with('verify')
            .with('tracking')
            .with('info', (build) => build.with('files', (buildF) => {
                buildF.where('object_type', 'App/Models/Info');
            }))
            .with('tramite', (build) => {
                build.with('tramite_type');
            }).where('trackings.id', params.id)
            .where('tra.entity_id', entity.id)
            .where('dependencia_id', dependencia.id)
            .where('visible', 1)
            .whereRaw(`IF(modo = 'YO', IF(user_verify_id = ${auth.id}, 1, 0), 1)`)
            .select('trackings.*')
            .first();
        if (!tracking) throw new NotFoundModelException("El trámite");
        // marcar como leído
        if (!tracking.readed_at) {
            tracking.merge({ readed_at: moment().format('YYYY-MM-DD hh:mm:ss') });
            tracking.save();
        }
        // obtener tramite
        let tramite = await tracking.tramite().fetch();
        // obtener code_qr;
        let code_qr = await tramite.funcCodeQr();
        // serializar tracking
        tracking = await tracking.toJSON();
        // obtener dependencias
        let dependenciaIds = [tracking.dependencia_id, tramite.dependencia_origen_id, tracking.tracking ? tracking.tracking.dependencia_id : ""];
        let dependencias = await this._dependencias(request, dependenciaIds);
        // obtener persona
        let personIds = [tracking.person_id, tramite.person_id, tracking.tracking ? tracking.tracking.person_id : null];
        let people = await this._people(request, personIds);
        // setting tracking
        tracking.person = people.where('id', tracking.person_id).first() || {};
        tracking.dependencia = dependencias.where('id', tracking.dependencia_id || "").first() || {};
        // original
        tracking.person_origen = tracking.person;
        tracking.dependencia_origen = tracking.dependencia;
        // validar trcking anidado
        if (tracking.tracking) {
            tracking.person = people.where('id', tracking.tracking.person_id).first() || {};
            tracking.dependencia = dependencias.where('id', tracking.tracking.dependencia_id || "").first() || {};
            tracking.tracking.person = tracking.person;
            tracking.tracking.dependencia = tracking.dependencia;
        }
        // setting tramite
        tracking.tramite.person = people.where('id', tracking.tramite.person_id).first() || {};
        tracking.tramite.dependencia_origen = dependencias.where('id', tracking.tramite.dependencia_origen_id).first() || {};
        // archivos
        let files = await this._files([tracking.id, tracking.tramite_id]);
        // add files
        tracking.tramite.files = await files.where('object_type', 'App/Models/Tramite').where('object_id', tracking.tramite_id).toArray();
        tracking.tramite.code_qr = code_qr;
        // obtener files antiguos
        let tmpFiles = await File.query()
            .join('tramites as tra', 'tra.id', 'files.object_id')
            .where('files.object_type', 'App/Models/Tramite')
            .where('tra.slug', tramite.slug)
            .where('tra.id', '<', tramite.id)
            .select('files.*', 'tra.tramite_parent_id')
            .orderBy('tra.tramite_parent_id', 'DESC')
            .fetch();
        tmpFiles = await tmpFiles.toJSON();
        // save old_files
        tracking.tramite.old_files = tmpFiles;
        // response 
        return {
            success: true,
            status: 201,
            tracking
        }
    }

    // obtener dependencias
    _dependencias = async (request, ids = []) => {
        let dependencias = await request.api_authentication.get(`dependencia?ids[]=${ids.join('&ids[]=')}`)
            .then(res => {
                let { dependencia } = res.data;
                return dependencia.data;
            }).catch(err => ([]));
        return collect(dependencias);
    }

    // obtener personas
    _people = async (request, ids = []) => {
        let people = await request.api_authentication.get(`find_people?id[]=${ids.join('&id[]=')}`)
            .then(res => res.data)
            .catch(err => ([]));
        return collect(people);
    }

    // obtener files
    _files = async (ids = [], types = ['App/Models/Tracking', 'App/Models/Tramite']) => {
        let files = await File.query()
            .whereIn('object_type', types)
            .whereIn('object_id', ids)
            .fetch();
        // response
        return collect(await files.toJSON());
    }

}

module.exports = AuthTramiteController
