'use strict'

const TramiteHook = exports = module.exports = {}

const Tracking = use('App/Models/Tracking');
const Verify = use('App/Models/Verify');
const File = use('App/Models/File');
const DB = use('Database');
const Drive = use('Drive');
const collect = require('collect.js');

// eliminar en cadena
TramiteHook.deleteChildren = async (tramite) => {
    // obtener ids tracking
    let tracking_ids = await Tracking.query()
        .where('tramite_id', tramite.id)
        .pluck('id');
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
    let tracking_files = await File.query()
        .whereIn('object_type', ['App/Models/Tracking'])
        .whereIn('object_id', tracking_ids)
        .fetch();
    tracking_files = await tracking_files.toJSON();
    // fusionar arrays
    files = [...files, ...tracking_files];
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
    // eliminar tracking
    await Tracking.query()
        .where('tramite_id', tramite.id)
        .delete();
}