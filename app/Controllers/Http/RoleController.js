'use strict'

const Role = use('App/Models/Role');
const collect = require('collect.js');
const { validation } = require('validator-error-adonis');
const DBException = require('../../Exceptions/DBException');
const NotFoundModelException = require('../../Exceptions/NotFoundModelException');

class RoleController {

    index = async ({ request }) => {
        // filters
        const { page } = request.all();
        // config
        let entity = request.$entity;
        let dependencia_id = request.input('dependencia_id');
        let state = request.input('state', 1) ? 1 : 0;
        // obtener roles
        let roles = await Role.query()
            .where('entity_id', entity.id)
            .where('dependencia_id', dependencia_id)
            .where('state', state)
            .paginate(page || 1, 20);
        roles = await roles.toJSON();
        // obtener users
        let datos = collect(roles.data);
        let pluked = datos.pluck('user_id').toArray();
        let users = await this._getUsers(request, pluked);
        roles.data = datos.map(d => {
            d.user = users.where('id', d.user_id).first() || {};
            return d;
        });
        // response
        return {
            success: true,
            status: 201,
            roles
        }
    }

    store = async ({ request }) => {
        await validation(null, request.all(), {
            user_id: 'required',
            level: 'required'
        });
        // config
        let entity = request.$entity;
        let dependencia_id = request.input('dependencia_id')
        // obtener usuario
        let user = await this._findUser(request, request.input('user_id'));
        if (!user) throw new Error("No se encontró el usuario");
        // guardar
        try {
            let role = await Role.create({
                entity_id: entity.id,
                dependencia_id: dependencia_id,
                user_id: user.id,
                person_id: user.person_id,
                level: request.input('level')
            });
            // response
            return { 
                success: true,
                status: 201,
                message: "Los datos se guardarón correctamente!",
                role,
            }   
        } catch (error) {
            throw new DBException(error, "Rol");
        }     
    }

    disabled = async ({ params, request }) => {
        let role = await Role.find(params.id);
        if (!role) throw new NotFoundModelException("El rol");
        role.merge({ state: 0 });
        await role.save();
        // response
        return {
            success: true,
            status: 201,
            message: "El rol se deshabilito correctamente!"
        }
    }

    _getUsers = async (request, ids = []) => {
        let { users, success } = await request.api_authentication.get(`user?page=1&ids=${ids.join('&ids=')}`)
        .then(res => res.data)
        .catch(err => ({ success: false, users: {} }));
        return collect(users.data || []);
    }

    _findUser = async (request, id) => {
        let { user, success } = await request.api_authentication.get(`user/${id}`)
        .then(res => res.data)
        .catch(err => ({ success: false, user: null }));
        return user;
    }

}

module.exports = RoleController
