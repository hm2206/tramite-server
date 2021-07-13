'use strict'

const NextEntity = require('../../Entities/NextEntity');
const Tracking = use('App/Models/Tracking');
const Tramite = use('App/Models/Tramite');
const Role = use('App/Models/Role');
const { validation, ValidatorError } = require('validator-error-adonis');
const CustomException = require('../../Exceptions/CustomException');
const FileController = require('./FileController');
const moment = require('moment');
const NotFoundModelException = require('../../Exceptions/NotFoundModelException');
const { collect } = require('collect.js');
const Info = use('App/Models/Info');
const DB = use('Database');
const File = use('App/Models/File');
const Drive = use('Drive');

class NextController {

    async handle({ params, request }) {
        let body = request.all();
        await validation(null, body, {
            "status": "required"
        })
        // config
        let authentication = request.api_authentication;
        let entity = request.$entity;
        let dependencia = request.$dependencia;
        let user = request.$auth;
        let multiple = request.input('multiple') ? JSON.parse(request.input('multiple') || "[]") : [];
        let users = request.input('users') ? JSON.parse(request.input('users', '[]')) : [];
        let is_action = request.input('is_action') == 1 ? 1 : 0;
        // next
        const nextEntity = new NextEntity(authentication, entity.id, dependencia.id, user.id);
        nextEntity.setMultiple(multiple);
        nextEntity.setUsers(users);
        nextEntity.setRequest(request);
        nextEntity.setIsAction(is_action);
        const tracking = await nextEntity.execute(params.id, body.status, body);
        // response
        return {
            success: true,
            status: 201,
            message: "El trámite se procesó correctamente!",
            tracking
        }
    }

}

module.exports = NextController;
