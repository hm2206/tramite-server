'use strict'

const Role = use('App/Models/Role');

class AuthRoleController {

    handle = async ({ request }) => {
        let dependencia = request.$dependencia;
        let entity = request.$entity;
        let auth = request.$auth;
        let role = await Role.query()
            .where('dependencia_id', dependencia.id)
            .where('entity_id', entity.id)
            .where('user_id', auth.id)
            .first();
        if (role) role.user = auth;
        // obtener jefe
        let boss = await Role.query()
            .where('dependencia_id', dependencia.id)
            .where('entity_id', entity.id)
            .where('level', 'BOSS')
            .first();
        if (boss) {
            let user = await request.api_authentication.get(`user/${boss.user_id}`)
                .then(res => res.data)
                .catch(err => ({}));
            boss.user = user;
        }
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