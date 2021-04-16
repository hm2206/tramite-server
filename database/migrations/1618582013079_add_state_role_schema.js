'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class AddStateRoleSchema extends Schema {
  up () {
    this.table('roles', (table) => {
      table.dropUnique(['user_id', 'dependencia_id', 'entity_id']);
      table.boolean('state', 1).defaultTo(1);
      table.unique(['user_id', 'dependencia_id', 'entity_id', 'state']);
    })
  }

  down () {
    this.table('roles', (table) => {
      table.dropColumn('state');
      table.unique(['user_id', 'dependencia_id', 'entity_id']);
    })
  }
}

module.exports = AddStateRoleSchema
