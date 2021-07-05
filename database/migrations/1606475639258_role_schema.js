'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class RoleSchema extends Schema {
  up () {
    this.create('roles', (table) => {
      table.increments()
      table.integer('user_id')
      table.integer('entity_id');
      table.integer('dependencia_id')
      table.enum('level', ['BOSS', 'SECRETARY'])
      table.timestamps()
    })
  }

  down () {
    this.drop('roles')
  }
}

module.exports = RoleSchema
