'use strict'

const Role = use('App/Models/Role');

class AuthRoleController {
    
    _getUser = async (request, id) => {
        let {  user } = await request.api_authentication.get(`user/${id}`)
        .then(res => res.data)
        .catch(err => ({ success: false, user: {}}));
        return user;
    }

    handle = async ({ request }) => {
        let dependencia = request.$dependencia;
        let entity = request.$entity;
        let auth = request.$auth;
        let role = await Role.query()
            .where('dependencia_id', dependencia.id)
            .where('entity_id', entity.id)
            .where('user_id', auth.id)
            .where('state', 1)
            .first();
        if (role) role.user = auth;
        // obtener jefe
        let boss = await Role.query()
            .where('dependencia_id', dependencia.id)
            .where('entity_id', entity.id)
            .where('level', 'BOSS')
            .where('state', 1)
            .first();
        if (boss) boss.user = await this._getUser(request, boss.user_id)
        // response
        return { 
            success: true,
            status: 201,
            role: role || {},
            boss: boss || {}
        };
    }

}

module.exports = AuthRoleController;