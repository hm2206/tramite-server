'use strict'

const Tracking = use('App/Models/Tracking');
const collect = require('collect.js');
const File = use('App/Models/File');
const DB = use('Database');
const Config = use('App/Models/Config');

class AuthTrackingController {

    // obtener dependencias
    _dependencias = async (request, trackings) => {
        let db = collect(trackings.data);
        let plucked = db.pluck('dependencia_id');
        // console.log(db);
        let pluckedTramite = db.pluck('tramite.dependencia_origen_id');
        let pluckedTracking = db.pluck('tracking.dependencia_id');
        let pluckedTrackingSend = db.pluck('tracking_send.dependencia_id').pluck('dependencia_id');
        let ids = collect([
            ...plucked.toArray(),
            ...pluckedTramite.toArray(),
            ...pluckedTracking.toArray(),
            ...pluckedTrackingSend.toArray(),
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
    _people = async (request, trackings) => {
        let db = collect(trackings.data);
        let values = db.pluck('person_id').toArray();
        let ids = [...values, db.pluck('tramite_person_id').toArray()];
        let people = await request.api_authentication.get(`find_people?id[]=${ids.join('&id[]=')}`)
            .then(res => res.data)
            .catch(err => ([]));
        // response
        return collect(people);
    }

    // obtener archivos
    _files = async (request, trackings) => {
        let db = collect(trackings.data);
        let plucked = db.pluck('id', 'tramite_id');
        let ids = collect([...plucked.keys().toArray(), ...plucked.values().toArray()]).toArray();
        let files = await File.query()
            .whereIn('object_type', ['App/Models/Tramite', 'App/Models/Tracking'])
            .whereIn('object_id', ids)
            .fetch();
        files = await files.toJSON();
        // response
        return collect(files);
    }

    // obtener configs
    _config = async (request, trackings) => {
        let datos = collect(trackings.data);
        let keys = datos.pluck('status').toArray();
        let configs = await Config.query()
            .whereIn('variable', ['NEXT', 'DAY_LIMIT'])
            .fetch();
        // obtener JSON
        configs = await configs.toJSON();
        // reponse
        return collect(configs);
    }

    // executar
    handle = async ({ params, request }) => {
        let { page, query_search, status, tracking_id, archived } = request.all();
        let modos = `${params.modo}`.toUpperCase() == 'DEPENDENCIA' ? ['DEPENDENCIA'] : ['DEPENDENCIA', 'YO'];
        status = typeof status == 'undefined' ? ['REGISTRADO'] : typeof status == 'string' ? [status] : status;
        tracking_id = !tracking_id ? [] : typeof tracking_id == 'string' ? [tracking_id] : tracking_id;
        // filtros
        let entity = request.$entity;
        let dependencia = request.$dependencia;
        let auth = request.$auth;
        // query
        let trackings = Tracking.query()
            .with('tramite', (build) => {
                build.with('tramite_type')
            })
            .with('tracking')
            .with('tracking_send')
            .join('tramites as tra', 'tra.id', 'trackings.tramite_id')
            .select('trackings.*', 'tra.person_id as tramite_person_id')
            .orderBy('trackings.created_at', 'DESC')
            .where('visible', 1)
            .where('trackings.dependencia_id', dependencia.id)
            .whereIn('modo', modos);
        // filtros
        if (typeof archived != 'undefined') trackings.where('trackings.archived', archived)
        if (tracking_id.length) trackings.whereIn('trackings.id', tracking_id);
        if (modos.includes('YO')) trackings.where('trackings.user_verify_id', auth.id);
        if (status.length) trackings.whereIn('trackings.status', status);
        if (query_search) trackings.leftJoin('files as f', 'f.object_id', 'tra.id')
            .where('f.object_type', 'App/Models/Tramite')
            .where(DB.raw(`(tra.slug like '%${query_search}%' OR tra.document_number like '%${query_search}%' OR f.name like '%${query_search}%')`))
            .groupBy('trackings.id', 'trackings.tramite_id', 'trackings.dependencia_id',
                'trackings.dependencia_id', 'trackings.user_id', 'trackings.user_verify_id', 
                'trackings.person_id', 'trackings.current', 'trackings.alert', 'trackings.revisado', 
                'trackings.modo', 'trackings.visible', 'trackings.status', 'trackings.first', 
                'trackings.archived', 'trackings.state', 'trackings.readed_at'
            )
        // paginación
        trackings = await trackings.paginate(page || 1, 20);
        trackings = await trackings.toJSON();
        // obtener dependencias
        let dependencias = await this._dependencias(request, trackings);
        // obtener people
        let people = await  this._people(request, trackings);
        // obtener files
        let files = await this._files(request, trackings);
        // obtener configs
        let configs = await this._config(request, trackings);
        let configs_index = {};
        let configs_keys = configs.pluck('key').toArray();
        // actions
        let actions = {
            PENDIENTE: "tracking",
            ACEPTADO: "tracking",
            DERIVADO: "tracking",
            FINALIZADO: "tracking",
            RECHAZADO: "tracking",
            RECIBIDO: "tracking",
            RESPONDIDO: "tracking",
            COPIA: "tracking",
            ENVIADO: "tracking"
        }
        // console.log(dependencias);
        // setting datos
        await trackings.data.map(async (d, indexD) => {
            let current_dependencia = await dependencias.where('id', d.dependencia_id || "").first() || {};
            // config tracking
            d.dependencia = current_dependencia
            d.person = await people.where('id', d.person_id).first() || {};
            d.files = await files.where('object_type', 'App/Models/Tracking').where('object_id', d.id).toArray() || [];
            // validar traking
            let validation = actions[d.status];
            if (validation) {
                let current_tracking = d[validation];
                d.dependencia = {};
                if (current_tracking) {
                    d.dependencia = await dependencias.where('id', current_tracking.dependencia_id || "").first() || {};
                }
            }
            // config trámite
            d.tramite.dependencia_origen = await dependencias.where('id', d.tramite.dependencia_origen_id || "").first() || {};
            d.tramite.person = await people.where('id', d.tramite.person_id).first() || {};
            d.tramite.files = await files.where('object_type', 'App/Models/Tramite').where('object_id', d.tramite.id).toArray() || [];
            d.is_next = true;
            // validar seleccion
            if (configs_keys.includes(d.status)) {
                let current_config = configs.where('key', d.status).first() || {};
                configs_index[d.status] = typeof configs_index[d.status] === 'number' ? configs_index[d.status] + 1 : 1;
                let current_index = trackings.page * configs_index[d.status];
                d.is_next = current_index <= current_config.value ? true : false;
            }
            // validar limite de dia
            let semaforos = await configs.where('variable', 'DAY_LIMIT').toArray();
            await semaforos.map((s, indexS) => {
                if (indexS == 0 && d.day <= s.value) d.semaforo = s.key;
                if (indexS > 0 && d.day >= s.value) d.semaforo = s.key;
                // validar el último
                if (!d.semaforo && indexS == (semaforos.length - 1)) d.semaforo = s.key;
            });
            // response
            return d;
        });
        // response 
        return {
            success: true,
            status: 201,
            trackings
        }
    }

}

module.exports = AuthTrackingController
