'use strict'

const Role = use('App/Models/Role');

class AuthRoleController {

    handle = async ({ request }) => {
        let dependencia = request._dependencia;
        let entity = request._entity;
        let auth = request.$auth;
        let role = await Role.query()
            .where('dependencia_id', dependencia.id)
            .where('entity_id', entity.id)
            .where('user_id', auth.id)
            .first();
        // response
        return { 
            success: true,
            status: 201,
            role: role || {}
        };
    }

}

module.exports = AuthRoleController;