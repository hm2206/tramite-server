'use strict'

const TramiteHook = exports = module.exports = {}

const Tracking = use('App/Models/Tracking');
const Verify = use('App/Models/Verify');
const File = use('App/Models/File');
const Info = use('App/Models/Info');
const DB = use('Database');
const Drive = use('Drive');
const collect = require('collect.js');

// eliminar en cadena
TramiteHook.deleteChildren = async (tramite) => {
    // obtener ids tracking
    let trackings = await Tracking.query()
        .where('tramite_id', tramite.id)    
        .select('id', 'info_id')
        .fetch();
    trackings = collect(await trackings.toJSON());
    let tracking_ids = trackings.pluck('id').toArray();
    let info_ids = trackings.pluck('info_id').toArray();
    // eliminar verificación
    await Verify.query()
        .whereIn('tracking_id', tracking_ids)
        .delete();
    // obtener archivos del tramite
    let files = await File.query()
        .whereIn('object_type', ['App/Models/Tramite'])
        .where('object_id', tramite.id)
        .fetch();
    files = await files.toJSON();
    // obtener archivos del tracking
    let info_files = await File.query()
        .whereIn('object_type', ['App/Models/info'])
        .whereIn('object_id', info_ids)
        .fetch();
    info_files = await info_files.toJSON();
    // fusionar arrays
    files = [...files, ...info_files];
    // elimnar archivos temporales
    await files.map(async f => {
        let exists = await Drive.exists(f.real_path);
        if (exists) await Drive.delete(f.real_path);
    });
    // eliminar archivos de la base de datos
    let ids = collect(files).pluck('id').toArray();
    await File.query()
        .whereIn('id', ids)
        .delete();
    // eliminar infos
    let [{affectedRows}] = await DB.raw(`DELETE i FROM infos as i 
        INNER JOIN trackings as t ON t.info_id = i.id
        WHERE t.tramite_id = ${tramite.id}
    `)
    // eliminar tracking
    await Tracking.query()
        .where('tramite_id', tramite.id)
        .delete();
}