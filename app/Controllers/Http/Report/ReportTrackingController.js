'use strict'

const ReportBuilder = use('ReportBuilder');
const Env = use('Env');
const Tramite = use('App/Models/Tramite');
const codeQR = require('qrcode');
const moment = require('moment');
const collect = require('collect.js');


class ReportTrackingController {

    handle = async ({ request, params, view, response }) => {
        try {
            let tramite = await Tramite.query()
                .with("tramite_type")
                .with('tracking', (build) => {
                    build.whereIn("status", ['ACEPTADO', 'DERIVADO', 'RESPONDIDO', 'RECHAZADO', 'FINALIZADO','ANULADO']);
                }).where("id", params.id)
                .first();
            if (!tramite) throw new Error("No se encontró el tramite");
            tramite = await tramite.toJSON();
            let link = `${Env.get('CLIENT_TRAMITE')}?slug=${tramite.slug}`;
            let code_qr = await codeQR.toDataURL(link)
            // obtener remitento
            let person = await request.api_authentication.get(`find_person/${tramite.person_id}`)
                .then(res => res.data)
                .catch(err => ({}));
            // obtener trackings
            let trackings = collect(JSON.parse(JSON.stringify(tramite.tracking)));
            trackings.push({ dependencia_destino_id: tramite.dependencia_id });
            // obtener dependencias
            let dependencias = await this._getDependencias(request, trackings.groupBy('dependencia_destino_id').keys().toArray());
            // setting datos
            await tramite.tracking.map(track => {
                track.dependencia_destino = dependencias.where("id", track.dependencia_destino_id).first() || {};
                return track;
            });
            // agregar dependencia tramite
            tramite.dependencia = await dependencias.where('id', tramite.dependencia_id).first() || {};
            // generar html
            let html = await view.render("reports.tracking", {
                tramite,
                code_qr,
                moment,
                person,
            });
            // generar
            // await ReportBuilder.loadHTML(html);
            // const bufferResult = await ReportBuilder.outputBuffer();
            // response.header('Content-Type', 'application/pdf');
            // return response.send(bufferResult);
            return html;
        } catch (error) {
            return response.status(error.status || 501)
                .send({
                    success: false,
                    status: error.status || 501,
                    message: error.message
                })
        }
    } 

    // obtener dependencias
    _getDependencias = async (request, dependenciaIds = []) => {
        let ids = collect(dependenciaIds);
        let current_ids = ids.chunk(20).toArray();
        let datos = [];
        // peticiones
        for (let query_ids of current_ids) {
            let query = query_ids.join('&ids[]=');
            let  { success, dependencia } = await request.api_authentication.get(`dependencia?ids[]=${query}`)
                .then(res => res.data)
                .catch(err => ({ success: false }));
            // validar dependencia
            if (success) datos = dependencia.data;
        }
        // reponse
        return collect(datos);
    }

}

module.exports = ReportTrackingController
